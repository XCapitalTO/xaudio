const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

const NodeID3 = require('node-id3');
const axios = require('axios');
const lyricsFinder = require('lyrics-finder');

// Configuração do FFmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();

const PORT = process.env.PORT || 3000;

// =========================
// Middlewares
// =========================

app.use(helmet());

app.use(compression());

app.use(cors());

app.use(express.json({
    limit: '10mb'
}));

// Arquivos estáticos
app.use(express.static(__dirname));

// =========================
// Tratamento Global de Erros
// =========================

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

// =========================
// Health Check
// =========================

app.get('/health', (req, res) => {
    return res.status(200).json({
        status: 'online',
        service: 'XAudio',
        uptime: process.uptime()
    });
});

// =========================
// API Conversão
// =========================

app.post('/api/convert', async (req, res) => {

    try {

        const {
            url,
            format = 'mp3',
            quality = '192',
            trimStart,
            trimEnd,
            normalize
        } = req.body;

        // =========================
        // Validação URL
        // =========================

        const youtubeRegex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;

        if (!youtubeRegex.test(url)) {

            return res.status(400).json({
                error: 'URL do YouTube inválida'
            });

        }

        // =========================
        // Buscar Informações do Vídeo
        // =========================

        const info = await youtubedl(url, {
            dumpJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        });

        const title = (info.title || 'audio')
            .replace(/[^\w\s-]/gi, '')
            .trim();

        // =========================
        // Stream de áudio
        // =========================

        const subprocess = youtubedl.exec(url, {
            o: '-',
            f: 'bestaudio'
        });

        const rawStream = subprocess.stdout;

        // =========================
        // Processamento FFmpeg
        // =========================

        let command = ffmpeg(rawStream)
            .toFormat(format);

        // Qualidade áudio
        if (format === 'mp3' || format === 'm4a') {
            command.audioBitrate(quality);
        }

        // Corte início
        if (trimStart) {
            command.setStartTime(trimStart);
        }

        // Corte final
        if (trimEnd) {
            command.outputOptions([
                '-to',
                trimEnd
            ]);
        }

        // Normalize
        if (normalize) {
            command.audioFilter('loudnorm');
        }

        const audioStream = command.pipe();

        // =========================
        // Headers
        // =========================

        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${title}.${format}"`
        );

        let contentType = 'audio/mpeg';

        if (format === 'wav') {
            contentType = 'audio/wav';
        }

        if (format === 'flac') {
            contentType = 'audio/flac';
        }

        if (format === 'm4a') {
            contentType = 'audio/mp4';
        }

        res.setHeader('Content-Type', contentType);

        // =========================
        // MP3 com ID3 Tags
        // =========================

        if (format === 'mp3') {

            const chunks = [];

            audioStream.on('data', (chunk) => {
                chunks.push(chunk);
            });

            audioStream.on('end', async () => {

                let buffer = Buffer.concat(chunks);

                try {

                    const artist = info.uploader || 'X-Audio';

                    const songTitle = info.title || title;

                    // =========================
                    // Buscar Letra
                    // =========================

                    let lyrics = '';

                    try {

                        lyrics = await lyricsFinder(
                            artist,
                            songTitle
                        ) || '';

                    } catch (err) {

                        console.error('⚠️ Letra não encontrada');

                    }

                    // =========================
                    // Baixar Thumbnail
                    // =========================

                    let imageBuffer = null;

                    if (info.thumbnail) {

                        try {

                            const thumbRes = await axios.get(
                                info.thumbnail,
                                {
                                    responseType: 'arraybuffer',
                                    timeout: 10000
                                }
                            );

                            imageBuffer = Buffer.from(thumbRes.data);

                        } catch (err) {

                            console.error('⚠️ Erro ao baixar thumbnail');

                        }

                    }

                    // =========================
                    // Tags ID3
                    // =========================

                    const tags = {

                        title: songTitle,

                        artist: artist,

                        album: 'X-Audio Downloads'

                    };

                    // Imagem
                    if (imageBuffer) {

                        tags.image = {

                            mime: 'image/jpeg',

                            type: {
                                id: 3,
                                name: 'front cover'
                            },

                            description: 'Thumbnail',

                            imageBuffer

                        };

                    }

                    // Lyrics
                    if (lyrics) {

                        tags.unsynchronisedLyrics = {

                            language: 'por',

                            text: lyrics

                        };

                    }

                    // Escrever tags
                    buffer = NodeID3.write(tags, buffer);

                } catch (err) {

                    console.error(
                        '❌ Erro ao adicionar ID3 tags:',
                        err.message
                    );

                }

                return res.end(buffer);

            });

            // =========================
            // Erros Stream
            // =========================

            audioStream.on('error', (err) => {

                console.error('❌ Download Stream Error:', err);

                if (!res.headersSent) {

                    return res.status(500).json({
                        error: 'Erro no stream'
                    });

                }

            });

            command.on('error', (err) => {

                console.error('❌ FFmpeg Error:', err.message);

                if (!res.headersSent) {

                    return res.status(500).json({
                        error: 'Erro de conversão FFmpeg'
                    });

                }

            });

        } else {

            // =========================
            // Outros formatos
            // =========================

            audioStream.pipe(res);

            command.on('error', (err) => {

                console.error('❌ FFmpeg Error:', err.message);

                if (!res.headersSent) {

                    return res.status(500).json({
                        error: 'Erro na conversão'
                    });

                }

            });

        }

    } catch (error) {

        console.error('❌ Server Error:', error);

        if (!res.headersSent) {

            return res.status(500).json({
                error: 'Falha ao processar requisição'
            });

        }

    }

});

// =========================
// Inicialização Servidor
// =========================

app.listen(PORT, () => {

    console.log(`
🚀 XAudio Server Online
🌐 Porta: ${PORT}
✅ Ambiente pronto para produção
    `);

});
