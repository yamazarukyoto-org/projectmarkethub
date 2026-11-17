const sharp = require('sharp');
const path = require('path');

async function createCircularFavicon() {
  const inputPath = path.join(__dirname, 'public', 'プロマケロゴ.jpg');
  const outputPath = path.join(__dirname, 'public', 'favicon.png');
  
  // ファビコンのサイズ
  const size = 192;
  
  try {
    // 元の画像を読み込んでメタデータを取得
    const metadata = await sharp(inputPath).metadata();
    console.log('元の画像サイズ:', metadata.width, 'x', metadata.height);
    
    // 正方形にリサイズ（中央からクロップ）
    const minDimension = Math.min(metadata.width, metadata.height);
    
    // 円形マスクを作成（SVG）
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/>
      </svg>`
    );
    
    // 画像を正方形にクロップしてリサイズ
    const resizedImage = await sharp(inputPath)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .toBuffer();
    
    // 円形マスクを適用
    await sharp(resizedImage)
      .composite([{
        input: circleMask,
        blend: 'dest-in'
      }])
      .png()
      .toFile(outputPath);
    
    console.log('円形ファビコンを作成しました:', outputPath);
    
    // 32x32サイズも作成（ブラウザタブ用）
    const smallOutputPath = path.join(__dirname, 'public', 'favicon-32.png');
    await sharp(inputPath)
      .resize(32, 32, {
        fit: 'cover',
        position: 'center'
      })
      .composite([{
        input: Buffer.from(
          `<svg width="32" height="32">
            <circle cx="16" cy="16" r="16" fill="white"/>
          </svg>`
        ),
        blend: 'dest-in'
      }])
      .png()
      .toFile(smallOutputPath);
    
    console.log('32x32ファビコンを作成しました:', smallOutputPath);
    
  } catch (error) {
    console.error('エラー:', error);
  }
}

createCircularFavicon();
