const websocket = require('ws');
const createWorker = require('tesseract.js').createWorker;
const ocrWorker = createWorker({ logger: () => null });
const fs = require('fs-extra');
const nodeWatch = require('node-watch');
const moment = require('moment');
const colors = require('colors-console')

global.now = {};

function getNowTimeFormat() {
    return moment().utcOffset('+0800').locale('zh-cn').format('YYYY-MM-DD LTS')
}

function log(message, levels) {
    levels = levels == undefined ? 'info' : levels;
    let colors_table = {
        'verbose': 'grey',
        'info': 'bright',
        'warn': 'yellow',
        'error': 'red'
    };
    console.log(colors(colors_table[levels], `[${getNowTimeFormat()}][${levels.toUpperCase().padStart(7)}]: ${message}`));
}

(async () => {
    //init now state
    {
        let now = await fs.readFile('./now.json');
        if (now != '{}') {
            global.now = JSON.parse(now);
        } else {
            global.now = {};
        }
        log('now state initialized.', 'warn');
    }

    //init ocrworker and declarate a function
    await ocrWorker.load();
    await ocrWorker.loadLanguage('eng+chi_sim');
    await ocrWorker.initialize('eng+chi_sim');
    log(`OCR modules initialized.`, 'warn');
    async function ocr(img, options) {
        if (options != undefined) {
            await worker.setParameters(options);
        }
        let result = await ocrWorker.recognize(img,);
        return result.data.text.replace(/\s/g, '');
    }

    //init websocket server
    const wss = new websocket.Server({ port: 8988 });
    wss.on('connection', function (ws, req) {
        ws.on('message', async function (message) {
            let request = JSON.parse(message);
            switch (request.type) {
                case 'sync':
                    if (request.method == 'push') {
                        global.now[request.imei] = request.data;
                        await fs.writeFile('./now.json', JSON.stringify(global.now, undefined, 2));
                        log(`收到来自 ${request.imei} 的 Now State, 已存储。`, 'warn')
                    } else if (request.method == 'pull') {
                        ws.send(JSON.stringify({
                            type: 'sync',
                            code: 200,
                            data: global.now,
                            message: 'success'
                        }));
                        log(`收到来自 ${req.socket.remoteAddress} 的同步请求, 已发送。`, 'warn')
                    }
                    break;
                case 'log':
                    log(`[REMOTE]:${request.message}`, request.level);
                    break;
                case 'ocr':
                    let result = await ocr(request.img, request.options);
                    ws.send(JSON.stringify({
                        type: 'ocr_response',
                        code: 200,
                        message: 'success',
                        result: result
                    }))
                    break;
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'unknown request type'
                    }));
            }
        })
        log(`Client connected. ip: ${req.socket.remoteAddress}`, 'warn');
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'connect successed.'
        }));

    })
    log('WebSocket Server init successed. Listining in port 8988', 'warn');

    log('File watch initialized.', 'warn');

    nodeWatch('./now.json', {}, async (event, name) => {
        let content = await fs.readJson(name);
        if (JSON.stringify(content) == JSON.stringify(global.now)) {
            return;
        }
        log('[LOCAL] now.json 发生变化，向客户端广播变化...')
        global.now = content;
        wss.clients.forEach(function (client) {
            if (client.readyState === websocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'sync',
                    code: 200,
                    data: content,
                    message: 'success'
                }));
            }
        });
    })
})();