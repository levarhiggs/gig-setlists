// scripts/upload-audio-to-r2.cjs — one-time/occasional batch upload:
// scans a local music folder, fuzzy-matches files to your song library
// (same matcher used by the in-app bulk-attach flow), uploads matched
// files to the Cloudflare R2 bucket, and writes the resulting public
// streaming URL onto each Song's audioUrl field in Firestore — the same
// field the app already reads for playback (see
// src/features/player/audio-source.js). Once a song has audioUrl set,
// ANY device (including phones with no local file access) can stream it
// directly, no local attach needed.
//
// Usage:
//   node scripts/upload-audio-to-r2.js "D:\Music Downloads\Motown Family Reunion Gig"
//
// Requires .env filled in (see .env.example) with R2 credentials, and
// runs against the SAME Firestore project the app uses (init.js's public
// web config, hardcoded below to match) — no service account needed
// since Firestore rules are currently open for read/write.

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
const { matchSongsToFiles } = require('./audio-match-node.cjs');

const REQUIRED_ENV = ['R2_BUCKET_NAME', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in .env — copy .env.example to .env and fill it in first.`);
    process.exit(1);
  }
}

const AUTO_SELECT_THRESHOLD = 0.6; // same bar as the in-app bulk-attach review
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg)$/i;

const firebaseConfig = {
  apiKey: 'AIzaSyDtSLg4KEfvvMxgQpYN79GPP8pRfqUPU1I',
  authDomain: 'gig-setlists.firebaseapp.com',
  projectId: 'gig-setlists',
  storageBucket: 'gig-setlists.firebasestorage.app',
  messagingSenderId: '866626505344',
  appId: '1:866626505344:web:a6175d66c4ad0bdd0af465',
};

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function listAudioFilesRecursive(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listAudioFilesRecursive(fullPath));
    } else if (entry.isFile() && AUDIO_EXT.test(entry.name)) {
      results.push({ name: entry.name, fullPath });
    }
  }
  return results;
}

function contentTypeFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg' }[ext] || 'application/octet-stream';
}

async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: node scripts/upload-audio-to-r2.cjs "<path to music folder>"');
    process.exit(1);
  }
  if (!fs.existsSync(folder)) {
    console.error(`Folder not found: ${folder}`);
    process.exit(1);
  }

  console.log(`Scanning ${folder} for audio files...`);
  const files = listAudioFilesRecursive(folder);
  console.log(`Found ${files.length} audio file(s).`);
  if (!files.length) return;

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log('Loading song library from Firestore...');
  const songsSnap = await getDocs(collection(db, 'songs'));
  const songs = [];
  songsSnap.forEach(d => songs.push({ songId: d.id, ...d.data() }));
  console.log(`Loaded ${songs.length} song(s).`);

  const toUpload = songs.filter(s => !s.audioUrl);
  console.log(`${songs.length - toUpload.length} song(s) already have audioUrl set — skipping those.`);
  if (!toUpload.length) {
    console.log('Nothing to do.');
    return;
  }

  const fileNames = files.map(f => f.name);
  const candidatesBySong = matchSongsToFiles(toUpload, fileNames);
  const byName = new Map(files.map(f => [f.name, f]));

  let uploaded = 0;
  let skippedLowConfidence = 0;
  const noMatch = [];

  for (const song of toUpload) {
    const candidates = candidatesBySong.get(song.songId) || [];
    const top = candidates[0];
    if (!top || top.score < AUTO_SELECT_THRESHOLD) {
      if (top) skippedLowConfidence++;
      else noMatch.push(song.title);
      continue;
    }

    const file = byName.get(top.fileName);
    const ext = path.extname(file.name) || '.mp3';
    const key = `audio/${song.songId}${ext}`;

    const alreadyThere = await objectExists(key);
    if (!alreadyThere) {
      const body = fs.readFileSync(file.fullPath);
      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(file.name),
      }));
    }

    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    await updateDoc(doc(db, 'songs', song.songId), {
      audioUrl: publicUrl,
      audioFileName: file.name,
      updatedAt: new Date().toISOString(),
    });

    console.log(`${alreadyThere ? 'Linked (already in R2)' : 'Uploaded'}: "${song.title}" <- ${file.name} (${Math.round(top.score * 100)}% match)`);
    uploaded++;
  }

  console.log(`\nDone. ${uploaded} song(s) now streaming from R2.`);
  if (skippedLowConfidence) console.log(`${skippedLowConfidence} song(s) had only a low-confidence file match — review and attach manually if needed.`);
  if (noMatch.length) console.log(`No candidate file found for: ${noMatch.join(', ')}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Upload failed:', err);
  process.exit(1);
});
