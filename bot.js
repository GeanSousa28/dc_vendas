const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")
    const sock = makeWASocket({ auth: state })

    sock.ev.on("creds.update", saveCreds)

    let levels = {}
    let xp = {}
    let atividade = {}
    let mensagens = {}
    let bemVindo = true

    // AUTO CONFIG
    let autoRemover = true
    let diasLimite = 5
    let grupoID = null

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return

        const from = msg.key.remoteJid
        const isGroup = from.endsWith("@g.us")
        const sender = msg.key.participant || from

        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text
        if (!texto) return

        // 📌 DETECTAR GRUPO AUTOMATICAMENTE
        if (isGroup) grupoID = from

        // 📊 ATIVIDADE
        atividade[sender] = Date.now()
        mensagens[sender] = (mensagens[sender] || 0) + 1

        // ⭐ SISTEMA DE XP
        xp[sender] = (xp[sender] || 0) + 10

        if (!levels[sender]) levels[sender] = 1

        if (xp[sender] >= levels[sender] * 100) {
            xp[sender] = 0
            levels[sender]++

            await sock.sendMessage(from, {
                text: `🎉 @${sender.split("@")[0]} subiu para nível ${levels[sender]}!`,
                mentions: [sender]
            })
        }

        // 📋 MENU
        if (texto === ".menu") {
            await sock.sendMessage(from, {
                text: `📋 MENU

📊 Atividade
.ativos
.inativos 2
.ranking
.checkoff 5

⭐ Nível
.nivel

🤖 Auto Mod
.autoremove on/off

👥 Grupo
.kick
.silenciar
.ativar

⚙️ Outros
.bemvindo on/off`
            })
        }

        // ⭐ VER NÍVEL
        if (texto === ".nivel") {
            await sock.sendMessage(from, {
                text: `⭐ Nível: ${levels[sender]}\nXP: ${xp[sender]}/${levels[sender]*100}`
            })
        }

        // 🏆 RANKING
        if (texto === ".ranking") {
            let ranking = Object.entries(mensagens)
                .sort((a,b)=>b[1]-a[1])
                .slice(0,10)

            let txt = "🏆 Ranking:\n\n"
            ranking.forEach((u,i)=>{
                txt += `${i+1}º @${u[0].split("@")[0]} - ${u[1]} msgs\n`
            })

            await sock.sendMessage(from,{
                text: txt,
                mentions: ranking.map(u=>u[0])
            })
        }

        // ⚠️ INATIVOS
        if (texto.startsWith(".inativos")) {
            let dias = parseInt(texto.split(" ")[1]) || 2
            let agora = Date.now()

            let lista = []
            for (let user in atividade) {
                let diff = (agora - atividade[user]) / (1000*60*60*24)
                if (diff >= dias) lista.push(user)
            }

            let txt = `😴 Inativos (${dias} dias):\n\n`
            lista.forEach(u=>{
                txt += `@${u.split("@")[0]}\n`
            })

            await sock.sendMessage(from,{
                text: txt,
                mentions: lista
            })
        }

        // 🔥 ATIVOS
        if (texto === ".ativos") {
            let agora = Date.now()
            let lista = []

            for (let user in atividade) {
                let diff = (agora - atividade[user]) / (1000*60*60*24)
                if (diff < 2) lista.push(user)
            }

            let txt = "🔥 Ativos (2 dias):\n\n"
            lista.forEach(u=>{
                txt += `@${u.split("@")[0]}\n`
            })

            await sock.sendMessage(from,{
                text: txt,
                mentions: lista
            })
        }

        // 🤖 AUTO REMOVE
        if (texto === ".autoremove on") {
            autoRemover = true
            await sock.sendMessage(from,{ text: "✅ Auto remover ON" })
        }

        if (texto === ".autoremove off") {
            autoRemover = false
            await sock.sendMessage(from,{ text: "❌ Auto remover OFF" })
        }

        // 👥 KICK
        if (texto.startsWith(".kick") && isGroup) {
            let user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid
            if (user) {
                await sock.groupParticipantsUpdate(from, user, "remove")
            }
        }

        // 🔇 SILENCIAR
        if (texto === ".silenciar" && isGroup) {
            await sock.groupSettingUpdate(from, "announcement")
        }

        // 🔊 ATIVAR
        if (texto === ".ativar" && isGroup) {
            await sock.groupSettingUpdate(from, "not_announcement")
        }

        // 🎉 BEM VINDO
        if (texto === ".bemvindo on") {
            bemVindo = true
        }

        if (texto === ".bemvindo off") {
            bemVindo = false
        }
    })

    // 🎉 ENTRADA
    sock.ev.on("group-participants.update", async (update) => {
        if (!bemVindo) return

        for (let user of update.participants) {
            if (update.action === "add") {
                await sock.sendMessage(update.id,{
                    text: `👋 Bem-vindo @${user.split("@")[0]}!`,
                    mentions: [user]
                })
            }
        }
    })

    // 🚫 AUTO REMOVE LOOP
    setInterval(async () => {
        if (!autoRemover || !grupoID) return

        let agora = Date.now()

        try {
            let metadata = await sock.groupMetadata(grupoID)

            for (let user in atividade) {
                let diff = (agora - atividade[user]) / (1000*60*60*24)

                if (diff >= diasLimite) {
                    let membro = metadata.participants.find(p=>p.id===user)

                    if (membro && !membro.admin) {
                        await sock.sendMessage(grupoID,{
                            text: `🚫 @${user.split("@")[0]} removido por inatividade`,
                            mentions:[user]
                        })

                        await sock.groupParticipantsUpdate(grupoID,[user],"remove")
                        delete atividade[user]
                    }
                }
            }
        } catch(e) {
            console.log("Erro:", e)
        }

    }, 3600000)
}

startBot()
