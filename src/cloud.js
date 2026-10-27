import { save } from './vars.js';
import { loc } from './locale.js';

// Cloud save in a secret GitHub Gist. The token and gist id live in their own
// localStorage keys so they never end up inside the exported save string.
const api = 'https://api.github.com/gists';
const fileName = 'evolve-save.txt';

export const cloudState = { status: '' };

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

// The gist id is cached per device; a new device finds the gist by its file name.
// ponytail: only the first 100 gists are searched; page through them if an account has more.
async function findGist(){
    let id = save.getItem('gist_id');
    if (id){
        return id;
    }
    let gist = (await request(`${api}?per_page=100`)).find(g => g.files[fileName]);
    if (gist){
        save.setItem('gist_id', gist.id);
        return gist.id;
    }
    return null;
}

export async function cloudSave(data){
    let id = await findGist();
    let gist = await request(id ? `${api}/${id}` : api, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ description: 'Evolve save', public: false, files: { [fileName]: { content: data } } })
    });
    save.setItem('gist_id', gist.id);
    return gist.updated_at;
}

export async function cloudLoad(){
    let id = await findGist();
    if (!id){
        throw new Error(loc('cloud_none'));
    }
    let gist = await request(`${api}/${id}`);
    let file = gist.files[fileName];
    if (!file){
        throw new Error(loc('cloud_none'));
    }
    // The API cuts file content off at 1 MB; the raw url always has all of it
    let data = file.truncated ? await fetch(file.raw_url).then(res => res.text()) : file.content;
    return { data, date: gist.updated_at };
}
