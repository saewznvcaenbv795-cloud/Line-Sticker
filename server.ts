import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json({ limit: '20mb' }));

// Server-side Gemini client
const ai = new GoogleGenAI();

// Available candidate models with fallback for high reliability
const CANDIDATE_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

// API endpoint to generate LINE Sticker metadata & info.md content
app.post('/api/generate-sticker-info', async (req, res) => {
  try {
    const { stickerCount, packTitle, sampleImagesBase64, sampleImageBase64 } = req.body;

    const parts: any[] = [];

    // Accept an array of sample images or single image to let Gemini see character expressions & count
    const imageList: string[] = Array.isArray(sampleImagesBase64) && sampleImagesBase64.length > 0
      ? sampleImagesBase64.slice(0, 3)
      : sampleImageBase64 ? [sampleImageBase64] : [];

    for (const imgBase64 of imageList) {
      if (typeof imgBase64 === 'string' && imgBase64.startsWith('data:')) {
        const mimeMatch = imgBase64.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const cleanBase64 = imgBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        });
      }
    }

    parts.push({
      text: `คุณเป็นผู้เชี่ยวชาญด้านการตั้งชื่อและเขียนคำบรรยายชุดสติกเกอร์สำหรับส่งขายบน LINE Creators Market (creator.line.me)

โปรดวิเคราะห์รูปภาพตัวละครที่ส่งมาให้ละเอียด:
1. ดูว่าตัวละครในภาพคือตัวอะไร (เช่น แมว, สุนัข, กระต่าย, เด็กผู้หญิง, สัตว์เลี้ยง, สิ่งของมีชีวิต ฯลฯ)
2. นับจำนวนตัวละคร:
   - หากในรูปเป็น "ตัวละครเดี่ยว (ตัวเดียว)" ห้ามใส่คำว่า "และผองเพื่อน", "และเพื่อนๆ", หรือ "แก๊ง" เด็ดขาด ให้ตั้งชื่อเฉพาะของตัวละครตัวนั้น เช่น "น้อง...", "เจ้า...", หรือชื่อเรียกน่ารักๆ
   - หากในรูปมีหลายตัวละครจริงๆ จึงจะอนุญาตให้ใช้คำว่า "และผองเพื่อน" หรือ "แก๊งเพื่อน" ได้
3. สำคัญที่สุด: สติกเกอร์ชุดนี้เป็น "สติกเกอร์ภาพนิ่ง (Static Sticker)" ห้ามมีคำว่า "ดุ๊กดิ๊ก", "ขยับได้", หรือ "Animated" ในชื่อหรือคำอธิบายเด็ดขาด!
4. ดูอารมณ์และบุคลิกของตัวละครในภาพ (น่ารัก, กวนๆ, อบอุ่น, สดใส, ตลก) แล้วนำมาแต่งคำบรรยายให้ตรงกับภาพมากที่สุด

ชุดสติกเกอร์มีจำนวน: ${stickerCount || 40} รูป
ชื่อชุดเบื้องต้น: "${packTitle || 'LINE Sticker'}"

ข้อกำหนดของ LINE Creators Market:
- ชื่อชุดสติกเกอร์ (ไทย): สั้นกระชับ น่ารัก ตรงกับตัวละครจริงในภาพ ไม่เกิน 40 ตัวอักษร
- ชื่อชุดสติกเกอร์ (อังกฤษ): สื่อถึงตัวละคร เข้าใจง่าย ไม่เกิน 40 ตัวอักษร
- คำอธิบายสติกเกอร์ (ไทย): บรรยายจุดเด่น อารมณ์ และประโยชน์ในการส่งแชท สุภาพ ชวนให้ซื้อ ไม่เกิน 160 ตัวอักษร
- คำอธิบายสติกเกอร์ (อังกฤษ): สุภาพ กระชับ ไม่เกิน 160 ตัวอักษร
- ตอบกลับมาเป็น JSON ตาม Schema ที่กำหนดเท่านั้น`,
    });

    let generatedResult = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                titleTh: {
                  type: Type.STRING,
                  description: 'ชื่อชุดสติกเกอร์ภาษาไทยที่ตรงกับตัวละครจริงในภาพ ไม่เกิน 40 ตัวอักษร',
                },
                titleEn: {
                  type: Type.STRING,
                  description: 'English sticker set title matching the actual character under 40 chars',
                },
                descriptionTh: {
                  type: Type.STRING,
                  description: 'คำอธิบายสติกเกอร์ภาษาไทยตรงกับตัวละคร ไม่เกิน 160 ตัวอักษร',
                },
                descriptionEn: {
                  type: Type.STRING,
                  description: 'English description for the sticker pack under 160 chars',
                },
              },
              required: ['titleTh', 'titleEn', 'descriptionTh', 'descriptionEn'],
            },
          },
        });

        const text = response.text?.trim() || '{}';
        generatedResult = JSON.parse(text);
        if (generatedResult?.titleTh) {
          break; // successfully generated
        }
      } catch (modelErr: any) {
        console.warn(`Model ${model} failed, trying fallback:`, modelErr?.message || modelErr);
      }
    }

    if (generatedResult && generatedResult.titleTh) {
      return res.json({
        success: true,
        info: generatedResult,
      });
    }

    throw new Error('All candidate models failed to generate');
  } catch (error: any) {
    console.error('Error generating sticker info with Gemini:', error);
    // Contextual static fallback without "ดุ๊กดิ๊ก" or "ผองเพื่อน"
    res.json({
      success: false,
      info: {
        titleTh: 'น้องคิวท์ ส่งความสุขประจำวัน',
        titleEn: 'Cute Character Daily Moments',
        descriptionTh: 'ส่งต่อความน่ารักสดใสและรอยยิ้มในทุกๆ วัน ด้วยสติกเกอร์สุดน่ารัก ใช้งานง่าย เหมาะกับทุกการแชท!',
        descriptionEn: 'Brighten your daily chats with these super cute and expressive stickers! Perfect for sharing feelings and daily vibes.',
      },
    });
  }
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
