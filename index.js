const websocket = require('ws');
const createWorker = require('tesseract.js').createWorker;
const ocrWorker = createWorker({ logger: () => null });
const fs = require('fs-extra');
const nodeWatch = require('node-watch');
const moment = require('moment');
const colors = require('colors-console')

global.state = {};

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
    console.log(colors(colors_table[levels], `[${getNowTimeFormat()}][${levels.toUpperCase().padStart(7)}]${message}`));
}

(async () => {
    //init now state
    {
        let state = await fs.readFile('./state.json');
        if (state != '{}') {
            global.state = JSON.parse(state);
        } else {
            global.state = {};
        }
        log('[ LOCAL]: State initialized.', 'warn');
    }

    //init ocrworker and declarate a function
    await ocrWorker.load();
    await ocrWorker.loadLanguage('eng+chi_sim');
    await ocrWorker.initialize('eng+chi_sim');
    log(`[ LOCAL]: OCR modules initialized.`, 'warn');
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
                case 'state/pull':
                    let imei = request.imei;
                    if(global.state[imei] != undefined) {
                        ws.send(JSON.stringify({
                            type: 'response',
                            response: request.id,
                            data: global.state[imei]
                        }));
                    }else{
                        ws.send(JSON.stringify({
                            type: 'response',
                            response: request.id,
                            data: global.state.template
                        }));
                    }
                    log(`[ LOCAL]: 收到来自 ${request.imei} 的 State 同步请求, 已发送。`, 'warn')
                    break;
                case 'state/push':
                    global.state[request.imei] = request.data.data;
                    await fs.writeFile('./state.json', JSON.stringify(global.state, undefined, 4));
                    log(`[ LOCAL]: 收到来自 ${request.imei} 的 State 推送, 已存储。`, 'warn')
                    break;
                case 'log':
                    log(`[REMOTE]: ${request.data.message}`, request.data.level);
                    break; 
                case 'ocr':
                    let result = await ocr(request.data.img, request.data.options);
                    ws.send(JSON.stringify({
                        type: 'response',
                        response: request.id,
                        data: result
                    }))
                    break;
            }
        })
        log(`[ LOCAL]: Client connected. ip: ${req.socket.remoteAddress}`, 'warn');
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'connect successed.'
        }));
    })
    log('[ LOCAL]: WebSocket Server init successed. Listining in port 8988', 'warn');

    log('[ LOCAL]: File watch initialized.', 'warn');

    nodeWatch('./state.json', {}, async (event, name) => {
        let content = await fs.readJson(name);
        if (JSON.stringify(content) == JSON.stringify(global.state)) {
            return;
        }
        log('[ LOCAL]: state.json 发生变化，向客户端广播变化...')
        global.state = content;
        wss.clients.forEach(function (client) {
            if (client.readyState === websocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'state/push',
                    data: content,
                }));
            }
        });
    })
})();