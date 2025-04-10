// required packages
const express = require("express");
const fetch = require("node-fetch");
const ytdl = require("ytdl-core");
const { exec } = require('child_process');
const { stdout, stderr } = require("process");
const path = require('path');
const fs = require('fs');
require("dotenv").config();
require("nodemon");

// create the express server
const app = express();

//server port number 
const PORT = process.env.PORT || 3000;

// set template engine
app.set("view engine", "ejs");
app.use(express.static("public"));

// needed to parse html data for POST request
app.use(express.urlencoded({
    extended: true
}))

app.use(express.json());

app.get("/", (req, res ) =>{
    res.render("index");
})
// for download-mp4
app.get("/downloadMp4", (req,res)=>{
    res.render("downloadMp4");
})

app.post("/convert-mp3", async (req, res ) =>{
    const videoId = req.body.videoID;
    if(videoId === undefined || videoId === "" || videoId === null){
        return res.render("index", {success: false, message:"please enter a video ID"});
    }else{
        const fetchAPI = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
            {"method":"GET",
                "headers" : {
                    "x-rapidapi-key" : process.env.API_KEY,
                    "x-rapidapi-host": process.env.API_HOST
                }
            });
        const  fetchResponse = await fetchAPI.json();
        
        // get the thumbnail url
        const thumbnailURL = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        if( fetchResponse.status === "ok"){
            return res.render("index", {success: true, song_title: fetchResponse.title, song_link: fetchResponse.link, song_size : fetchResponse.size,song_thumbnailURL: thumbnailURL});
        }else{
            return res.render("index",{success:false, message: fetchResponse.msg});
        }
    }
})

// get the info of the video
app.get("/info", async (req,res) => {
    const videoURL = req.query.url;

    if(!ytdl.validateURL(videoURL)){
        return res.json({error: "there's an error", message: "Invalid Youtube link! "});
    }

    // const info = await ytdl.getInfo(videoURL);
    // const formats = info.formats.filter(format => format.hasVideo && format.hasAudio).map(format =>({
    //     quality: format.qualityLabel,
    //     itag: format.itag
    // }))


    exec(`yt-dlp --dump-json "${videoURL}"`, (err, stdout, stderr) => {
        if (err) {
            return res.json({ error: 'Error retrieving video info', message:err.message });
        }
    
        try {
            const info = JSON.parse(stdout);
    
            // Filter MP4 video formats only
            const mp4Formats = info.formats
                .filter(format => format.ext === 'mp4' && format.vcodec !== 'none');
    
            // Deduplicate formats by height (keep best version by higher bitrate or filesize)
            const uniqueFormatsMap = new Map();
    
            for (const format of mp4Formats) {
                if (!format.height) continue; // skip if height is missing
    
                const key = format.height; // use resolution height as key
                const existing = uniqueFormatsMap.get(key);
    
                // Keep the better one based on filesize (or bitrate)
                if (!existing || (format.filesize || 0) > (existing.filesize || 0)) {
                    uniqueFormatsMap.set(key, format);
                }
            }
    
            // Final array of unique qualities
            const formats = Array.from(uniqueFormatsMap.values()).map(format => ({
                format_id: format.format_id,
                quality: `${format.height}p`,
                filesize: format.filesize,
                fps: format.fps,
                note: format.format_note,
                url: format.url
            }));
    
            res.json({
                vid_title: info.title,
                vid_duration: info.duration,
                thumbnail: info.thumbnail,
                video_id: info.id,
                qualities: formats
            });
        } catch (parseErr) {
            return res.json({ error: 'Failed to parse video info', message: parseErr.message });
        }
    });
    
})

const sanitize = (name) =>{
    return name.replace(/[\/\\?%*:|"<>]/g, '').trim();;
};

app.get('/download', (req,res)=>{
    const {url,videoFormatId,title} = req.query;

    if(!url || !videoFormatId){
        return res.status(400).json({error: "Missing Parameter"});
    }

    const safeTitle = sanitize(title || "video");
    const timeStamp = Date.now();
    const outputFile = path.join(__dirname, 'Downloads', `${safeTitle}-${timeStamp}.mp4`);
    const command = `yt-dlp -f "${videoFormatId}+140" --merge-output-format mp4 -o "${outputFile}" "${url}"`;

    exec(command,(err,stdout,stderr) => {
        if(err){
            console.error(stderr ||err.message);
            return res.status(500).json({error:'Download failed'});

        }

        res.download(outputFile,`${safeTitle}.mp4`,() =>{
            fs.unlink(outputFile, () =>{});
        })
    })

})


//start the server
app.listen(PORT, () =>{
    console.log(`Server started on port ${PORT}`);
})