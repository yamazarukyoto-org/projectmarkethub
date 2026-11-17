const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // HTMLファイルのパス
    const htmlPath = path.join(process.cwd(), 'guide-source.html');
    const pdfPath = path.join(process.cwd(), 'public', 'guide.pdf');

    console.log(`Loading HTML from: ${htmlPath}`);
    
    // ローカルファイルを読み込む
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    await page.setContent(htmlContent);

    console.log('Generating PDF...');
    
    // PDF生成
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px'
      }
    });

    console.log(`PDF saved to: ${pdfPath}`);
    
    await browser.close();
  } catch (error) {
    console.error('Error generating PDF:', error);
    process.exit(1);
  }
})();
