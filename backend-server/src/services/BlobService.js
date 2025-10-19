const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
class BlobService {
    constructor() {
        const credential = new DefaultAzureCredential();
        this.blobServiceClient = new BlobServiceClient(
            `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, 
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
            expiresOn: expiresOn, //change this time duration later
            permissions: BlobSASPermissions.parse("rw"),
        };
        
        const userDelegationKey = await this.blobServiceClient.getUserDelegationKey(new Date(), expiresOn);
        const sasToken = generateBlobSASQueryParameters(sasOptions, userDelegationKey, this.blobServiceClient.accountName).toString();
        return sasToken
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

        // Fetch a user delegation key
        const userDelegationKey = await this.blobServiceClient.getUserDelegationKey(new Date(), expiresOn);

        const sasOptions = {
            containerName,
            blobName: blobPath,
            permissions: sasPermissions.toString(),
            expiresOn: expiresOn,
            startsOn: new Date(new Date().valueOf() - 300 * 1000), // Optional: start time is 5 minutes before now
            userDelegationKey
        };

        const sasToken = generateBlobSASQueryParameters(sasOptions, userDelegationKey, this.blobServiceClient.accountName).toString();
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

            // Extract the path components (removing the leading '/')
            const pathSegments = parsedUrl.pathname.split('/').filter(part => part.length > 0);

            if (pathSegments.length < 2) {
                throw new Error("Invalid blob URL format");
            }

            // Remove the container name (first segment)
            let blobPath = pathSegments.slice(1).join('/');

            // Remove the file extension (if present)
            return blobPath.replace(/\.[^/.]+$/, ""); // Removes the last dot and extension
        } catch (error) {
            throw new Error(`Error extracting blob path: ${error.message}`);
        }
    }

}

module.exports = BlobService;
