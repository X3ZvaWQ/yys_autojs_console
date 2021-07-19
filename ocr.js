const createWorker = require('tesseract.js').createWorker;
const ocrWorker = createWorker({ logger: () => null });

(async () => {
    await ocrWorker.load();
    await ocrWorker.loadLanguage('eng+chi_sim');
    await ocrWorker.initialize('eng+chi_sim');

    async function ocr(img, options) {
        let result = await ocrWorker.recognize(img,);
        return result.data.text.replace(/\s/g, '');
    }

    console.log(await ocr('./1.png'));
})();