import { save } from './vars.js';
import { loc } from './locale.js';

// Cloud save in a secret GitHub Gist. The token and gist id live in their own
// localStorage keys so they never end up inside the exported save string.
const api = 'https://api.github.com/gists';
const manualFile = 'evolve-save.txt';
const autoFiles = ['evolve-auto-1.txt','evolve-auto-2.txt','evolve-auto-3.txt'];
// File name -> ISO date of its last write
const indexFile = 'evolve-index.json';

export const cloudState = { status: '', saves: [], auto: Number(save.getItem('gist_auto')) || 0 };

// ponytail: the index is cached for the session, so two devices saving at the same time can pick stale slots.
let index = null;
let timer = null;

function request(url, options = {}){
    return fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${save.getItem('gist_token')}`,
            Accept: 'application/vnd.github+json'
        }
    }).then(function(res){
        if (res.status === 404){
            save.removeItem('gist_id');
        }
        if (!res.ok){
            throw new Error(`GitHub ${res.status}`);
        }
        return res.json();
    });
}

// The gist id is cached per device; a new device finds the gist by its file names.
// ponytail: only the first 100 gists are searched; page through them if an account has more.
async function findGist(){
    let id = save.getItem('gist_id');
    if (id){
        return id;
    }
    let gist = (await request(`${api}?per_page=100`)).find(g => g.files[manualFile] || g.files[indexFile]);
    if (gist){
        save.setItem('gist_id', gist.id);
        return gist.id;
    }
    return null;
}

async function readGist(id){
    let gist = await request(`${api}/${id}`);
    index = gist.files[indexFile] ? JSON.parse(gist.files[indexFile].content) : {};
    return gist;
}

async function writeSave(pick, data){
    let id = await findGist();
    if (id && !index){
        await readGist(id);
    }
    let file = pick(index || {});
    let next = { ...index, [file]: new Date().toISOString() };
    let gist = await request(id ? `${api}/${id}` : api, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ description: 'Evolve save', public: false, files: {
            [file]: { content: data },
            [indexFile]: { content: JSON.stringify(next) }
        }})
    });
    index = next;
    save.setItem('gist_id', gist.id);
    return next[file];
}

export function cloudSave(data){
    return writeSave(() => manualFile, data);
}

// Overwrites the slot written longest ago; never written slots go first
export function cloudAutoSave(data){
    return writeSave(idx => autoFiles.reduce((a, b) => (idx[b] || '') < (idx[a] || '') ? b : a), data);
}

// Lists the manual save and the autosaves that exist, newest autosave first
export async function cloudList(){
    let id = await findGist();
    if (!id){
        throw new Error(loc('cloud_none'));
    }
    let gist = await readGist(id);
    let saves = [manualFile, ...autoFiles]
        .filter(f => gist.files[f])
        .map(f => ({ file: f, auto: f !== manualFile, date: index[f] || '', gistFile: gist.files[f] }));
    let autos = saves.filter(s => s.auto).sort((a, b) => b.date.localeCompare(a.date));
    saves = [...saves.filter(s => !s.auto), ...autos];
    if (saves.length === 0){
        throw new Error(loc('cloud_none'));
    }
    return saves;
}

export async function cloudRead(entry){
    // The API cuts file content off at 1 MB; the raw url always has all of it
    return entry.gistFile.truncated ? await fetch(entry.gistFile.raw_url).then(res => res.text()) : entry.gistFile.content;
}

export function setCloudAutoSave(minutes, run){
    cloudState.auto = minutes;
    save.setItem('gist_auto', minutes);
    clearInterval(timer);
    if (minutes > 0){
        timer = setInterval(run, minutes * 60000);
    }
}
