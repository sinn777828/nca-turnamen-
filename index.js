const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome (Linux)', '', '']
    });

    const targetPhoneNumber = "628xxxxxxxxxx"; // Ganti nomor WA lu (tanpa tanda +, spasi, atau strip)

    // Gunakan event connection.update untuk memastikan socket benar-benar siap
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Trigger pairing code aman saat socket mendeteksi status siap/meminta pairing
        if (!sock.authState.creds.registered && (qr || connection === 'connecting')) {
            setTimeout(async () => {
                if (!sock.authState.creds.registered) {
                    try {
                        const code = await sock.requestPairingCode(targetPhoneNumber);
                        console.log(`\n🔑 KODE PAIRING LU: ${code}\n`);
                    } catch (err) {
                        // Abaikan error sesaat jika socket masih handshaking
                    }
                }
            }, 3000);
        }

        if (connection === 'open') {
            console.log('Bot WhatsApp Berhasil Terhubung!');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menghubungkan ulang...');
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

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
                `4. Upload Poster + Caption & sertakan buktinya.\n\n` +
                `Silakan kirimkan seluruh bukti screenshot persyaratan ke sini!`;

            await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
        }
    });
}

startBot();
