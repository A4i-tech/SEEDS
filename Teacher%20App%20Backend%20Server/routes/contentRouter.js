"use strict";
// Built-in modules
const express = require("express");
const path = require("path");

// Third-party modules
const Agenda = require("agenda");
const { ObjectId } = require('mongoose').Types;
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Project modules
const Content = require("../models/Content.js");
const { ContentV3, getContent } = require("../models/ContentV3.js");
const QuizCreateRequest = require("../models/QuizCreateRequest.js");
const { QuizData, fromQuizCreateRequest } = require("../models/QuizData.js");
const BlobService = require("../services/BlobService.js");
const processNewContent = require("../jobs/processAudioContent.js");
const processQuizContent = require("../jobs/processQuizContent.js");
const { tryCatchWrapper } = require(path.join("..", "util.js"));

// Initialize instances
const blobService = new BlobService();
const router = express.Router();
const agenda = new Agenda({ db: { address: process.env.DB_CONNECTION } });

agenda.define("processNewContent", async (job) => {
    await processNewContent(job)
});

agenda.define("processQuizContent", async (job) => {
    await processQuizContent(job)
});


// Start Agenda.
(async function () {
    await agenda.start();
})();

router.get('/job/:jobId', async (req, res) => {
    const job = await agenda.jobs({ _id: new ObjectId(req.params.jobId) });

    if (!job.length) {
        return res.status(404).json({ error: "Job not found" });
    }

    const jobData = job[0].attrs;

    res.json(jobData);
});

// API to list all jobs (Running + Failed)
router.get('/jobs', async (req, res) => {
    try {
        // Fetch jobs that are either "In Progress" or "Failed"
        const jobs = await agenda.jobs({
            $or: [
                { failedAt: { $exists: true } }, // Failed jobs (any time)
                { lastRunAt: { $exists: true }, completedAt: { $exists: false } } // Running jobs
            ]
        });

        // Transform job data with document existence check
        const jobList = (await Promise.all(jobs.map(async job => {
            const mongooseModel = job.attrs.name === "processQuizContent" ? QuizData : ContentV3
            const contentId = job.attrs.data?.content?._id || null;
            let documentExists = false;

            // Check if document exists in MongoDB
            if (contentId) {
                documentExists = await mongooseModel.exists({ _id: contentId });
                if (documentExists) return null; // Skip this job
            }

            return {
                jobId: job.attrs._id,
                startedAt: job.attrs.data.startedAt,
                status: job.attrs.failedAt ? "ERROR" : "IN PROGRESS",
                metadata: {
                    title: job.attrs.data.content.title.english,
                    localTitle: job.attrs.data.content.title.local,
                    language: job.attrs.data.content.language
                }
            };
        }))).filter(job => job !== null);
        jobList.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
        res.json({ jobs: jobList });
    } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


router.post("/quiz", tryCatchWrapper(async (req, res)=>{
    const quizCreateRequest = new QuizCreateRequest(req.body)
    if (quizCreateRequest.id === 'default-id') {
        return res.status(400).json({ error: "Invalid Quiz format" });
    }
    const quizData = fromQuizCreateRequest(quizCreateRequest)
    quizData.creation_time = Math.floor(Date.now() / 1000);
    const quizDataDoc = quizData.toObject()
    const job = await agenda.now('processQuizContent', { content: quizDataDoc });
    res.json({
        message: "Processing New Content job scheduled!",
        jobId: job.attrs._id
    });
}))

// router.patch("/quiz", tryCatchWrapper(async (req, res)=>{
//     const quizCreateRequest = new QuizCreateRequest(req.body)
//     const quizData = QuizData.fromQuizCreateRequest(quizCreateRequest)
//     quizData.isProcessed = true
//     return res.json(await QuizData.findOneAndUpdate(
//         { id: quizData._id },                   
//         { $set: {
//             themeAudio: quizData.themeAudio,
//             titleAudio: quizData.titleAudio,
//             questions: quizData.questions,
//             isProcessed: quizData.isProcessed
//         } },
//         { new: true }
//     ).exec())
// }))

router.get("/sasUrl", tryCatchWrapper(async (req, res)=>{
    const url = req.query.url;  // URL is now obtained from query string
    if (!url) {
        return res.status(400).json({ error: "URL parameter is required." });
    }

    const urlWithSAS = await blobService.getURLWithSAS(url);
    return res.json({ url: urlWithSAS });
}))

router.get("/themes",tryCatchWrapper(async (req, res) => {
    const language = req.query.language
    const content = await ContentV3.find({language:language, isPullModel: true}).sort({_id:-1})
    const themeSet = new Set()
    const themes = []
    console.log(content.length)
    console.log(language)
    for(const cont of content){
        const theme = cont.theme.english
        if(!themeSet.has(theme)){
            themes.push({
                name: theme,
                audioUrl: cont.theme.audioUrl
            })
            themeSet.add(theme)
        }
    }
    return res.send(themes)
}))

router.get("/", tryCatchWrapper(async (req, res) => {
    // Fetch by language, theme (English name), and expName (type)
    if (req.query.language && req.query.theme && req.query.expName) {
        const language = req.query.language;
        const theme = decodeURIComponent(req.query.theme).toString(); // English name of the theme
        const type = req.query.expName;
        
        const contents = await ContentV3.find({
            isPullModel: true,
            language: language,
            "theme.english": theme,
            type: type.toLowerCase()
        }).sort({ _id: -1 }).exec();

        return res.json(contents);
    }

    // Fetch by multiple IDs
    if (req.query.ids) {
        const idsArray = Array.isArray(req.query.ids) ? req.query.ids : req.query.ids.split(",");

        const contents = await ContentV3.find({ _id: { $in: idsArray } }).exec();
        return res.json(contents);
    } 

    // Fetch only teacher-app content
    if (req.query.onlyTeacherApp) {
        const contents = await ContentV3.find({ isTeacherApp: true }).sort({ _id: -1 }).exec();
        return res.json(contents);
    }

    // Default: Fetch all contents
    return res.json(await getContent());
}));


// async function regenerateAllTitleAudios(){
//     const contents = await Content.find({isProcessed: true, isPullModel: true})
//     for(const content of contents){
//         console.log(`started working for content id=${content.id}`)
//         const response = await fetch(
//             'https://seedscontent.azurewebsites.net/api/acs',
//             {
//                 method: 'POST',
//                 body: JSON.stringify({
//                     type: "create-title-audio",
//                     id: content.id,
//                     localTitle: content.localTitle,
//                     theme: content.theme,
//                     localTheme: content.localTheme,
//                     lang: content.language,
//                     expType: content.type
//                 }),
//                 headers: { 'Content-Type': 'application/json' }
//             }
//         )
//         const jsonResponse = await response.json()
//         const titleAudio = jsonResponse.titleAudio
//         const themeAudio = jsonResponse.themeAudio
        
//         await Content.findOneAndUpdate(
//             { id: content.id },                   
//             { $set: { titleAudio, themeAudio } },
//             { new: true }
//         ).exec()

//         console.log(`id = ${content.id}`)
//         console.log(`titleAudio = ${titleAudio}`)
//         console.log(`ThemeAudio = ${themeAudio}`)
//     }
// }

// router.post("/regenerateAllTitleAudios", async (req,res) => {
//     regenerateAllTitleAudios()
//     return res.send("received. working on these...")
// })

router.get("/sasToken", tryCatchWrapper(async (req, res) => {
    const containerName = "input-container"
    const sasToken = await blobService.getUploadSASToken(req.query.blobName, containerName)
    const container_client = blobService.getContainerClient(containerName)

    return res.json({
        sasToken:`${container_client.getBlockBlobClient(req.query.blobName).url}?${sasToken}`
    });
}))

router.get("/:contentId", tryCatchWrapper(async (req, res) => {
    return res.json(await ContentV3.getContentById(req.params.contentId));
}))

// router.get("/:contentId/processed", tryCatchWrapper(async (req, res) => {
//     const content = await Content.getContentById(req.params.contentId);
//     // if the content is already processed just return that content object
//     if(content.isProcessed){
//         return content
//     }
//     let titleAudio = content.titleAudio;
//     let themeAudio = content.themeAudio;

//     var response = undefined
//     if (content.isPullModel) {
//         response =  await fetch(
//             'https://seedscontent.azurewebsites.net/api/acs',
//             {
//                 method: 'POST',
//                 body: JSON.stringify({
//                     type: "create-title-audio",
//                     id: req.params.contentId,
//                     localTitle: content.localTitle,
//                     theme: content.theme,
//                     localTheme: content.localTheme,
//                     lang: content.language,
//                     expType: content.type
//                 }),
//                 headers: { 'Content-Type': 'application/json' }
//             }
//         )
//     }
//     if(response){
//         const jsonResponse = await response.json()
//         titleAudio = jsonResponse.titleAudio
//         themeAudio = jsonResponse.themeAudio
//     }
    
//     return res.json(await Content.findOneAndUpdate(
//         { id: req.params.contentId },                   
//         { $set: { isProcessed: true, titleAudio, themeAudio } },
//         { new: true }
//     ).exec())
// }))

router.delete("/:contentId", tryCatchWrapper(async (req, res) => {
    const result = await ContentV3.updateOne({ id: req.params.contentId }, { $set: { isDeleted: true } });
    return res.json(result);
}))

router.post("/", tryCatchWrapper(async (req, res) => {
    let content = new ContentV3(req.body);
    content.creation_time = Math.floor(Date.now() / 1000);
    const contentData = content.toObject()
    const job = await agenda.now('processNewContent', { content: contentData });
    res.json({
        message: "Processing New Content job scheduled!",
        jobId: job.attrs._id
    });
}))

// router.patch("/",tryCatchWrapper(async (req,res) => {
//     const isAudioUploaded = req.query.isAudioUploaded === "true"
//     if(!req.body.isPullModel){
//         const response =  await fetch(
//             'https://seedscontent.azurewebsites.net/api/acs',
//             {
//                 method: 'POST',
//                 body: JSON.stringify({
//                     type:"delete-title-audio",
//                     id: req.body.id
//                 }),
//                 headers: { 'Content-Type': 'application/json' }
//             }
//         )
//     }
//     var titleAudio = ""
//     var themeAudio = ""
//     var isProcessed = undefined
//     if(isAudioUploaded){
//         isProcessed = false
//     }
//     else{
//         isProcessed = req.body.isProcessed
//         if(req.body.isPullModel){
//             const response =  await fetch(
//                     'https://seedscontent.azurewebsites.net/api/acs',
//                     {
//                         method: 'POST',
//                         body: JSON.stringify({
//                             type: "create-title-audio",
//                             id: req.body.id,
//                             localTitle: req.body.localTitle,
//                             theme: req.body.theme,
//                             localTheme: req.body.localTheme,
//                             lang: req.body.language,
//                             expType: req.body.type
//                         }),
//                         headers: { 'Content-Type': 'application/json' }
//                     }
//                 )
//             const jsonResponse = await response.json()
//             titleAudio = jsonResponse.titleAudio
//             themeAudio = jsonResponse.themeAudio
//         }
//     }
//     return res.json(await Content.findOneAndUpdate(
//             {
//                 _id:req.body._id // we can use id:req.body.id here id means audioId, this also works.
//             },
//             {
//                 $set: {
//                     title:req.body.title,
//                     description: req.body.description,
//                     type: req.body.type,
//                     language: req.body.language,
//                     isPullModel: req.body.isPullModel,
//                     isTeacherApp: req.body.isTeacherApp,
//                     isProcessed: isProcessed,
//                     titleAudio: titleAudio,
//                     localTitle: req.body.localTitle,
//                     theme: req.body.theme,
//                     localTheme: req.body.localTheme,
//                     themeAudio: themeAudio
//                 }
//             },
//             {
//                 new: true
//             }
//         ))
// }))

// async function populateAllTitleAudiosForPullModel(){
//     const contents = await Content.find({isPullModel: true})
//     for(const content of contents){
//         try{
//             const response =  await fetch(
//                 'https://seedscontent.azurewebsites.net/api/acs',
//                 {
//                     method: 'POST',
//                     body: JSON.stringify({
//                         type: "create-title-audio",
//                         id: content.id,
//                         localTitle: content.localTitle,
//                         theme: content.theme,
//                         localTheme: content.localTheme,
//                         lang: content.language,
//                         expType: content.type
//                     }),
//                     headers: { 'Content-Type': 'application/json' }
//                 }
//             )
//             const jsonResponse = await response.json()
//             const titleAudio = jsonResponse.titleAudio
//             const themeAudio = jsonResponse.themeAudio
        
//             await Content.findOneAndUpdate(
//                 { id: content.id },                   
//                 { $set: { titleAudio, themeAudio } },
//                 { new: true }
//             ).exec()
//             console.log(`Processed for id = ${content.id} and title = ${content.title}`)
//         }
//         catch(err){
//             console.log(`Error occured while handling content id = ${content.id} and Title = ${content.title}`)
//             console.error(err)
//         }

//     }
// }
// router.post("/populate-title-audios",async (req,res) => {
//     populateAllTitleAudiosForPullModel()
//     return res.send("populating...")
// })

// async function deleteBlobFromAContainer(containerName,blobNamePrefix){
//     const containerClient = blobService.getContainerClient(containerName);
//     const options = {
//       deleteSnapshots: 'include' // or 'only'
//     }
//     const blobList = containerClient.listBlobsFlat({prefix:blobNamePrefix})
//     for await (const blob of blobList){
//       await containerClient.deleteBlob(blob.name,options)
//       console.log(`Deleted blob with name = ${blob.name}`)
//     }
//   }

async function deleteAudioBlobs(audioId){
    const blobNamePrefix = audioId

    var containerName = "output-container"
    await deleteBlobFromAContainer(containerName,blobNamePrefix)

    containerName = "output-original"
    await deleteBlobFromAContainer(containerName,blobNamePrefix)

    containerName = "experience-titles"
    await deleteBlobFromAContainer(containerName,blobNamePrefix)
}

async function deleteUnnecessaryStorage(){
    const docs = await Content.find({})
    const containerName = "output-container"
    const containerClient = blobService.getContainerClient(containerName)
    for(const doc of docs){
        var deleteDoc = false
        var deleteBlob = false
        if(!doc.isProcessed){
            deleteDoc = true
            deleteBlob = true
        }
        const blobs = containerClient.listBlobsFlat({prefix:doc.id})
        const iterator = blobs.next()
        const { done } = await iterator
        if(done){
            deleteDoc = true
        }
        if(deleteDoc){
            await Content.deleteOne({ id: doc.id })
            console.log(`Deleted doc with id = ${doc.id}`)
        }
        if(deleteBlob){
            await deleteAudioBlobs(doc.id)
            console.log(`Deleted blob with id = ${doc.id}`)
        }
    }
}
router.post("/delete-unnecessary-storage", async (req,res) => {
    await deleteUnnecessaryStorage()
    return res.send("Deleted Successfully")
})

// router.post("/change-type-from-snippets-to-snippet", async (req,res) => {
//     await Content.updateMany({type:"Snippets"},{$set: {type: "Snippet"}})
//     res.send("Done");
// })
module.exports = router;