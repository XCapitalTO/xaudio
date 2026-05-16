const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Configure ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve the static frontend files
app.use(express.static(__dirname));

app.post('/api/convert', async (req, res) => {
    try {
        const { url, format = 'mp3', quality = '192', trimStart, trimEnd, normalize } = req.body;

        if (!url || !url.includes('youtu')) {
            return res.status(400).json({ error: 'URL do YouTube inválida' });
        }

        // Obter as informações do vídeo
        const info = await youtubedl(url, { dumpJson: true, noCheckCertificates: true, noWarnings: true, preferFreeFormats: true });
        const title = info.title.replace(/[^\w\s-]/gi, ''); // Sanitize filename

        // Obter a stream do áudio
        const subprocess = youtubedl.exec(url, { o: '-', f: 'bestaudio' });
        const rawStream = subprocess.stdout;

        // Processar o áudio usando FFmpeg (Aplica cortes, formatação e filtros)
        let command = ffmpeg(rawStream).toFormat(format);
        
        if (format === 'mp3' || format === 'm4a') {
            command.audioBitrate(quality);
        }
        if (trimStart) {
            command.setStartTime(trimStart);
        }
        if (trimEnd) {
            command.outputOptions(['-to', trimEnd]);
        }
        if (normalize) {
            command.audioFilter('loudnorm');
        }

        const audioStream = command.pipe();

        // Set Headers
        res.setHeader('Content-Disposition', `attachment; filename="${title}.${format}"`);
        
        let contentType = 'audio/mpeg';
        if (format === 'wav') contentType = 'audio/wav';
        if (format === 'flac') contentType = 'audio/flac';
        if (format === 'm4a') contentType = 'audio/mp4';
        
        res.setHeader('Content-Type', contentType);

        // Se for mp3, acumulamos em buffer para inserir as tags ID3 com a imagem de capa e letras
        if (format === 'mp3') {
            const chunks = [];
            audioStream.on('data', chunk => chunks.push(chunk));
            audioStream.on('end', async () => {
                let buffer = Buffer.concat(chunks);
                try {
                    const NodeID3 = require('node-id3');
                    const axios = require('axios');
                    const lyricsFinder = require('lyrics-finder');
                    
                    const artist = info.uploader || 'X-Audio';
                    const songTitle = info.title;

                    // Busca a letra (Lyrics)
                    let lyrics = '';
                    try {
                        lyrics = await lyricsFinder(artist, songTitle) || '';
                    } catch (err) { console.error('Letra não encontrada'); }

                    // Tenta baixar a capa do vídeo
                    let imageBuffer = null;
                    if (info.thumbnail) {
                        const thumbRes = await axios.get(info.thumbnail, { responseType: 'arraybuffer' });
                        imageBuffer = Buffer.from(thumbRes.data);
                    }
                    
                    const tags = {
                        title: songTitle,
                        artist: artist,
                        album: 'X-Audio Downloads'
                    };
                    
                    if (imageBuffer) {
                        tags.image = {
                            mime: 'image/jpeg',
                            type: { id: 3, name: 'front cover' },
                            description: 'Thumbnail',
                            imageBuffer: imageBuffer
                        };
                    }

                    if (lyrics) {
                        tags.unsynchronisedLyrics = {
                            language: 'por',
                            text: lyrics
                        };
                    }
                    
                    buffer = NodeID3.write(tags, buffer);
                } catch (e) {
                    console.error('Erro ao adicionar ID3 tags:', e.message);
                }
                res.end(buffer);
            });
            audioStream.on('error', (err) => {
                console.error('Download Stream Error:', err);
                if (!res.headersSent) res.status(500).json({ error: 'Erro no stream' });
            });
            command.on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
                if (!res.headersSent) res.status(500).json({ error: 'Erro de conversão FFmpeg' });
            });
        } else {
            audioStream.pipe(res);
            command.on('error', (err) => {
                console.error('FFmpeg Error:', err.message);
            });
        }

    } catch (error) {
        console.error('Server Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Falha ao processar requisição' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta http://localhost:${PORT}`);
});
