const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;

class BlobService {
    constructor() {
        let credential;
        
        // Check if the Shared Key is available
        if (AZURE_STORAGE_ACCOUNT_KEY) {
            credential = new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY);
            this.useSharedKey = true;
        } else {
            // Fallback to Default Azure Credential (User Delegation SAS)
            credential = new DefaultAzureCredential();
            this.useSharedKey = false;
        }

        this.blobServiceClient = new BlobServiceClient(
            `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, 
            credential
        );
    }

    getContainerClient(containerName){
        return this.blobServiceClient.getContainerClient(containerName)
    }

    getBlobServiceClient(){
        return this.blobServiceClient
    }

    async getUploadSASToken(blobname, containerName){
        const expiresOn = new Date(new Date().valueOf() + 3600 * 1000); // 1 hour from now
        const sasOptions = {
            containerName: containerName,
            blobName: blobname,
            startsOn: new Date(),
            expiresOn: expiresOn,
            permissions: BlobSASPermissions.parse("rw"),
        };
        
        let sasToken;
        
        if (this.useSharedKey) {
            // 1. Shared Key SAS (Service SAS)
            sasToken = generateBlobSASQueryParameters(
                sasOptions, 
                this.blobServiceClient.credential, 
                this.blobServiceClient.accountName
            ).toString();
        } else {
            // 2. Azure AD SAS (User Delegation SAS)
            const userDelegationKey = await this.blobServiceClient.getUserDelegationKey(new Date(), expiresOn);
            sasToken = generateBlobSASQueryParameters(sasOptions, userDelegationKey, this.blobServiceClient.accountName).toString();
        }
        
        return sasToken;
    }

    async getURLWithSAS(url) {
        const decodedUrl = decodeURIComponent(url);
        const parsedUrl = new URL(decodedUrl);
        const pathSegments = parsedUrl.pathname.split('/').filter(part => part.length > 0);
        const containerName = pathSegments[0];
        const blobPath = pathSegments.slice(1).join('/');

        // Get a blob client to interact with the blob
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobPath);

        const sasPermissions = new BlobSASPermissions();
        sasPermissions.read = true; // Setting read permissions for the SAS

        const expiresOn = new Date(new Date().valueOf() + 3600 * 1000); // 1 hour from now

        const sasOptions = {
            containerName,
            blobName: blobPath,
            permissions: sasPermissions.toString(),
            expiresOn: expiresOn,
            startsOn: new Date(new Date().valueOf() - 300 * 1000), // Optional: start time is 5 minutes before now
        };
        
        let sasToken;
        
        if (this.useSharedKey) {
            // 1. Shared Key SAS (Service SAS)
            sasToken = generateBlobSASQueryParameters(
                sasOptions, 
                this.blobServiceClient.credential, 
                this.blobServiceClient.accountName
            ).toString();
        } else {
            // 2. Azure AD SAS (User Delegation SAS)
            const userDelegationKey = await this.blobServiceClient.getUserDelegationKey(new Date(), expiresOn);
            sasOptions.userDelegationKey = userDelegationKey; // Add key to options for User Delegation SAS
            
            sasToken = generateBlobSASQueryParameters(
                sasOptions, 
                userDelegationKey, 
                this.blobServiceClient.accountName
            ).toString();
        }

        return `${blobClient.url}?${sasToken}`;
    }

    /**
     * Downloads the blob specified by the given blob URL into a buffer 
     * and returns the buffer.
     *
     * @param {string} blobUrl - The full URL of the blob to download.
     * @returns {Promise<Buffer>} - A Promise that resolves to a Buffer containing the blob's content.
     * @throws {Error} - Throws an error if the download operation fails.
     */
    async downloadBlobToBuffer(blobUrl) {
        // Decode and parse the blob URL
        const decodedUrl = decodeURIComponent(blobUrl);
        const parsedUrl = new URL(decodedUrl);
        const pathSegments = parsedUrl.pathname.split('/').filter(part => part.length > 0);
        const containerName = pathSegments[0];
        const blobPath = pathSegments.slice(1).join('/');

        // Get container and blob client
        const containerClient = this.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobPath);

        // Download blob to buffer and return it
        return await blobClient.downloadToBuffer();
    }

    /**
     * Extracts the blob path (everything after the container name) from a given Azure Blob Storage URL,
     * and removes the file extension from the blob name.
     *
     * @param {string} blobUrl - The full URL of the blob.
     * @returns {string} - The extracted blob path without the file extension.
     * @throws {Error} - Throws an error if the URL format is invalid.
     */
    extractBlobPathWithoutExtension(blobUrl) {
        try {
            // Parse the URL
            const parsedUrl = new URL(blobUrl);

            const pathSegments = parsedUrl.pathname.split('/').filter(part => part.length > 0);

            if (pathSegments.length < 2) {
                throw new Error("Invalid blob URL format");
            }

            let blobPath = pathSegments.slice(1).join('/');

            return blobPath.replace(/\.[^/.]+$/, ""); // Removes the last dot and extension
        } catch (error) {
            throw new Error(`Error extracting blob path: ${error.message}`);
        }
    }

}

module.exports = BlobService;