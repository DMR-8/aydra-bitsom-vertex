import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
async function main() {
  const count=Number(process.argv[2]??20); const path=process.argv[3]??`artifacts/test-${count}.pdf`; const letter=process.argv.includes('--letter');
  if(!Number.isInteger(count)||count<1) throw new Error('Pass a positive integer page count.');
  const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.HelveticaBold);
  for(let n=1;n<=count;n++){const p=doc.addPage(letter?[612,792]:[210*72/25.4,297*72/25.4]);p.drawText(String(n),{x:170,y:340,size:180,font,color:rgb(.1,.25,.18)});p.drawText(`HEAD - PAGE ${n}`,{x:50,y:740,size:24,font});p.drawText('LEFT', {x:20,y:200,size:16,font});p.drawText('RIGHT',{x:500,y:200,size:16,font});}
  await mkdir('artifacts',{recursive:true});await writeFile(path,await doc.save());console.log(path);
}
void main();
