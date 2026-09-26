const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadMediaMessage 
} = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');

// Nomor WhatsApp Bot
const NOMOR_WA_BOT = "6288991400566"; 

// API Key Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6L5OSvJl08cVMpUz0LZy8QSMh_33SGK9LwWh5f3BU_U8Q";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const userBuffers = {};
const userTimers = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            let code = await sock.requestPairingCode(NOMOR_WA_BOT);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log("\n========================================");
            console.log(`🔑 KODE PAIRING WHATSAPP KAMU: ${code}`);
            console.log("========================================\n");
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('Bot WhatsApp Berhasil Terhubung!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const messageType = Object.keys(msg.message)[0];
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (body.trim().toLowerCase() === '.pendaftaran') {
            const pesanMenu = `📋 *PERSYARATAN PENDAFTARAN KELOMPOK (5 ANGGOTA)*\n\nSetiap kelompok wajib mengirimkan total **15 Foto / Screenshot** (3 syarat x 5 anggota):\n\n1. 📌 **Follow TikTok 'nca'** (5 foto untuk 5 anggota)\n2. 📌 **Follow Saluran WA/IG** (5 foto untuk 5 anggota)\n3. 📌 **Upload Poster ke SW + Caption** (5 foto untuk 5 anggota)\n\n---\n💡 *Cara Mengirim:*\nKirimkan sekaligus **15 foto screenshot** tersebut di chat ini. Bot akan otomatis mengumpulkan foto dan mengecek kelengkapannya sekaligus!`;
            await sock.sendMessage(from, { text: pesanMenu }, { quoted: msg });
            return;
        }

        if (messageType === 'imageMessage') {
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                const mimeType = msg.message.imageMessage.mimetype || 'image/jpeg';

                if (!userBuffers[from]) userBuffers[from] = [];
                userBuffers[from].push({ buffer, mimeType });

                if (userTimers[from]) clearTimeout(userTimers[from]);

                userTimers[from] = setTimeout(async () => {
                    const totalFoto = userBuffers[from].length;
                    await sock.sendMessage(from, { 
                        text: `📥 *${totalFoto} foto diterima.* Sedang menganalisis seluruh bukti pendaftaran dengan AI... (Mohon tunggu sebentar)` 
                    });

                    await prosesKumpulanGambar(sock, from, userBuffers[from]);

                    delete userBuffers[from];
                    delete userTimers[from];
                }, 5000);

            } catch (error) {
                console.error("Gagal menerima gambar:", error);
            }
        }
    });
}

async function prosesKumpulanGambar(sock, from, itemGambar) {
    let countTikTok = 0;
    let countSaluran = 0;
    let countSW = 0;
    let fotoTidakDikenal = 0;

    const promptText = `
Kamu adalah AI verifikasi syarat pendaftaran turnamen Mobile Legends ENCEA / NCA.
Tugasmu adalah mengidentifikasi JENIS SYARAT dari gambar screenshot yang dikirimkan.

Aturan Identifikasi:
1. "TIKTOK": Jika gambar menunjukkan profil TikTok akun "@enceaaturnamen" / "Tour | NCA" / "NCA" dan terlihat tombol status "Mengikuti" atau "Following".
2. "SALURAN": Jika gambar menunjukkan halaman Saluran / Channel WhatsApp atau IG dengan nama "ENCEA", "ALL INFO TURNAMEN ENCEA", atau sejenisnya.
3. "SW": Jika gambar menunjukkan tampilan "Status saya" / "Story WhatsApp" yang mengunggah poster turnamen ENCEA (Mobile Legends) DAN terdapat teks caption di bawahnya (misalnya tulisan PRIZEPOOL, JUARA, LINK PENDAFTARAN, S3, S4, dll).
4. "LAINNYA": Jika gambar tidak termasuk salah satu dari 3 hal di atas atau tidak jelas.

Tolong jawab HANYA dengan SATU KATA KATEGORI di atas: TIKTOK, SALURAN, SW, atau LAINNYA.
`;

    for (const item of itemGambar) {
        try {
            const base64Image = item.buffer.toString('base64');
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    { text: promptText },
                    { inlineData: { mimeType: item.mimeType, data: base64Image } }
                ]
            });

            const hasil = response.text.trim().toUpperCase();

            if (hasil.includes("TIKTOK")) countTikTok++;
            else if (hasil.includes("SALURAN")) countSaluran++;
            else if (hasil.includes("SW")) countSW++;
            else fotoTidakDikenal++;

        } catch (err) {
            console.error("Gagal analisis 1 gambar:", err);
            fotoTidakDikenal++;
        }
    }

    const kurangTikTok = Math.max(0, 5 - countTikTok);
    const kurangSaluran = Math.max(0, 5 - countSaluran);
    const kurangSW = Math.max(0, 5 - countSW);
    const totalKurang = kurangTikTok + kurangSaluran + kurangSW;

    let laporan = `📊 *HASIL VERIFIKASI PENDAFTARAN KELOMPOK*\n`;
    laporan += `Total Screenshot Diterima: *${itemGambar.length} Foto*\n\n`;

    laporan += `📋 *Rincian Bukti Terdeteksi:*
• Follow TikTok @enceaaturnamen: *${countTikTok}/5* ${countTikTok >= 5 ? '✅' : '❌ (Kurang ' + kurangTikTok + ')'}
• Follow Saluran ENCEA: *${countSaluran}/5* ${countSaluran >= 5 ? '✅' : '❌ (Kurang ' + kurangSaluran + ')'}
• SW Poster + Caption: *${countSW}/5* ${countSW >= 5 ? '✅' : '❌ (Kurang ' + kurangSW + ')'}\n`;

    if (fotoTidakDikenal > 0) {
        laporan += `⚠️ *Foto Tidak Valid/Buram/Salah:* ${fotoTidakDikenal} foto\n`;
    }

    laporan += `\n-----------------------------------\n`;

    if (totalKurang === 0 && itemGambar.length >= 15) {
        laporan += `🎉 *LENGKAP!* Seluruh 15 bukti pendaftaran untuk 5 anggota kelompok kamu SUDAH VERIFIKASI!`;
    } else {
        laporan += `❌ *STATUS: BELUM LENGKAP*\n\n*Kekurangan:*`;
        if (kurangTikTok > 0) laporan += `\n- ${kurangTikTok} screenshot TikTok (@enceaaturnamen)`;
        if (kurangSaluran > 0) laporan += `\n- ${kurangSaluran} screenshot Saluran ENCEA`;
        if (kurangSW > 0) laporan += `\n- ${kurangSW} screenshot SW Poster + Caption`;
        
        laporan += `\n\n💡 *Silakan kirimkan kekurangannya saja.*`;
    }

    await sock.sendMessage(from, { text: laporan });
}

startBot();
  
