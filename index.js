const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
        markOnlineOnConnect: true,
        emitOwnEvents: false,
        fireInitQueries: false
    });

    if (!sock.authState.creds.registered) {
        const phoneNumber = await askQuestion('Masukkan nomor WhatsApp lu (contoh: 628xxxxxxxxxx): ');
        const code = await sock.requestPairingCode(phoneNumber.trim());
        console.log(`\n🔑 KODE PAIRING LU: ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('Bot WhatsApp Berhasil Terhubung!');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menghubungkan ulang...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (textMessage.includes('PENDAFTARAN ENCEA TOURNAMENT') || textMessage.includes('Nama Tim:')) {
            const replyText = `Halo Kak! Pendaftaran Encea Tournament kamu sudah kami terima.\n\n` +
                `*PERSYARATAN WAJIB (5 Orang per Tim - Total 15 Screenshot):*\n` +
                `1. Wajib Kirim 15 Screenshot (3 SS per orang untuk 5 anggota tim).\n` +
                `2. Follow TikTok @enceaaturnamen\n🔗 https://www.tiktok.com/@enceaaturnamen?_r=1&_t=ZS-9A3EpfdhxYr\n\n` +
                `3. Follow Saluran WhatsApp Encea Tournament\n🔗 https://whatsapp.com/channel/0029VbCoSrG3gvWa2hD6ZJ0Q\n\n` +
                `4. Upload Poster + Caption (cek story/status) & sertakan buktinya.\n\n` +
                `Silakan kirimkan seluruh bukti screenshot persyaratan ke sini!`;

            await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        }
    });
}

startBot();
