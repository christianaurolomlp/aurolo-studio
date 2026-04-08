// Aurolo Studio — Frontend
const API = '';
let allClips = [];
let currentFilter = 'all';
let activePlatform = {}; // clipTitle → 'tiktok' | 'youtube'

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadStreams();
});

// --- Stats ---
async function loadStats() {
    try {
        const res = await fetch(`${API}/api/stats`);
        const s = await res.json();
        document.getElementById('stats-bar').innerHTML = `
            <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-neon"></span>
                <span class="text-white/60">${s.total_clips} clips</span>
            </div>
            <div class="flex items-center gap-1.5">
                <span class="text-neon font-semibold">${s.approved}</span>
                <span class="text-white/40">aprobados</span>
            </div>
            <div class="flex items-center gap-1.5">
                <span class="text-yellow-400 font-semibold">${s.pending}</span>
                <span class="text-white/40">pendientes</span>
            </div>
            <div class="flex items-center gap-1.5">
                <span class="text-white/40">${s.tiktok} TT</span>
                <span class="text-white/20">|</span>
                <span class="text-white/40">${s.youtube} YT</span>
            </div>
        `;
    } catch (e) { console.error('Stats error:', e); }
}

// --- Streams ---
async function loadStreams() {
    try {
        const res = await fetch(`${API}/api/streams`);
        const streams = await res.json();
        const sel = document.getElementById('stream-select');
        streams.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.date} — ${s.title} (${s.total_clips} clips)`;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
            if (sel.value) loadClips(sel.value);
        });
        if (streams.length > 0) {
            sel.value = streams[0].id;
            loadClips(streams[0].id);
        }
    } catch (e) { console.error('Streams error:', e); }
}

// --- Clips ---
async function loadClips(streamId) {
    try {
        const res = await fetch(`${API}/api/streams/${streamId}/clips`);
        allClips = await res.json();
        activePlatform = {};
        renderClips();
        document.getElementById('empty-state').classList.add('hidden');
    } catch (e) { console.error('Clips error:', e); }
}

function filterClips(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('filter-active');
        if (btn.dataset.filter === filter) btn.classList.add('filter-active');
    });
    renderClips();
}

// Group clips by title (pair TikTok + YouTube together)
function groupClipsByMoment(clips) {
    const groups = {};
    clips.forEach(clip => {
        const key = clip.title;
        if (!groups[key]) groups[key] = { tiktok: null, youtube: null, title: clip.title, score: clip.score };
        groups[key][clip.platform] = clip;
    });
    return Object.values(groups);
}

function renderClips() {
    const grid = document.getElementById('clips-grid');

    // Filter raw clips first if platform-specific
    let filtered = allClips;
    if (currentFilter === 'pending' || currentFilter === 'approved' || currentFilter === 'rejected') {
        filtered = allClips.filter(c => c.status === currentFilter);
    } else if (currentFilter === 'tiktok') {
        filtered = allClips.filter(c => c.platform === 'tiktok');
    } else if (currentFilter === 'youtube') {
        filtered = allClips.filter(c => c.platform === 'youtube');
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-16"><p class="text-white/30">No hay clips con este filtro</p></div>`;
        return;
    }

    // Group by moment if showing all or status filter
    if (['all', 'pending', 'approved', 'rejected'].includes(currentFilter)) {
        const groups = groupClipsByMoment(filtered);
        grid.innerHTML = groups.map(g => renderGroupCard(g)).join('');
    } else {
        // Platform-specific: show individual cards
        grid.innerHTML = filtered.map(clip => renderSingleCard(clip)).join('');
    }
}

// --- Grouped card (1 card per moment, TikTok/YouTube toggle) ---
function renderGroupCard(group) {
    const key = group.title;
    const platform = activePlatform[key] || (group.tiktok ? 'tiktok' : 'youtube');
    const clip = group[platform];
    if (!clip) return '';

    const otherPlatform = platform === 'tiktok' ? 'youtube' : 'tiktok';
    const otherClip = group[otherPlatform];

    const statusColors = {
        pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        approved: 'bg-green-500/20 text-green-400 border-green-500/30',
        rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const statusLabels = { pending: 'PENDIENTE', approved: 'APROBADO', rejected: 'RECHAZADO' };
    const scoreBar = Math.min(clip.score * 10, 100);
    const caption = platform === 'tiktok' ? clip.caption_tiktok : clip.caption_youtube;

    return `
    <div class="clip-card bg-card rounded-xl border border-border overflow-hidden" data-id="${clip.id}" id="group-${encodeURIComponent(key)}">
        <!-- Video -->
        <div class="relative aspect-[9/16] max-h-[360px] bg-black">
            <video class="w-full h-full object-contain" preload="metadata" controls
                src="/api/clips/${clip.id}/video">
            </video>
            <div class="absolute top-2 left-2 flex gap-1.5">
                <span class="status-badge px-2 py-0.5 rounded-full border ${statusColors[clip.status]}">
                    ${statusLabels[clip.status]}
                </span>
            </div>
            ${clip.duration ? `<span class="absolute bottom-2 right-2 text-xs bg-black/70 px-2 py-0.5 rounded">${formatDuration(clip.duration)}</span>` : ''}
        </div>

        <!-- Info -->
        <div class="p-4">
            <h3 class="font-semibold text-sm leading-tight mb-2 line-clamp-2">${escapeHtml(clip.title)}</h3>

            <!-- Score -->
            <div class="flex items-center gap-2 mb-3">
                <span class="text-xs text-white/40">Score</span>
                <div class="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div class="h-full bg-neon rounded-full" style="width: ${scoreBar}%"></div>
                </div>
                <span class="text-xs font-semibold text-neon">${clip.score.toFixed(1)}</span>
            </div>

            <!-- Platform toggle -->
            <div class="flex gap-1.5 mb-3">
                <button onclick="switchPlatform('${escapeHtml(key)}', 'tiktok')"
                    class="flex-1 py-1.5 text-xs rounded-lg border transition font-medium
                    ${platform === 'tiktok' ? 'bg-neon/15 border-neon/40 text-neon' : 'border-border text-white/40 hover:text-white/70'}
                    ${!group.tiktok ? 'opacity-30 cursor-not-allowed' : ''}">
                    🎵 TikTok
                </button>
                <button onclick="switchPlatform('${escapeHtml(key)}', 'youtube')"
                    class="flex-1 py-1.5 text-xs rounded-lg border transition font-medium
                    ${platform === 'youtube' ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'border-border text-white/40 hover:text-white/70'}
                    ${!group.youtube ? 'opacity-30 cursor-not-allowed' : ''}">
                    ▶️ YouTube
                </button>
            </div>

            <!-- Caption -->
            <div class="caption-box text-xs text-white/50 bg-darker rounded-lg p-3 mb-3">
                <pre class="whitespace-pre-wrap font-sans">${escapeHtml(caption || 'Sin caption')}</pre>
                <button onclick="copyText(${JSON.stringify(caption || '')})" class="mt-2 text-neon hover:underline text-xs">📋 Copiar</button>
            </div>

            <!-- Actions (apply to both TT + YT of same moment) -->
            <div class="flex gap-2">
                ${clip.status !== 'approved' ? `
                <button onclick="approveMoment('${escapeHtml(key)}')" class="btn-approve flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-neon/30 text-neon text-xs font-medium transition">
                    ✅ Aprobar
                </button>` : ''}
                ${clip.status !== 'rejected' ? `
                <button onclick="rejectMoment('${escapeHtml(key)}')" class="btn-reject flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium transition">
                    ❌ Rechazar
                </button>` : ''}
                <a href="/api/clips/${clip.id}/download" class="flex items-center justify-center px-3 py-2 rounded-lg border border-border text-white/50 text-xs hover:text-white hover:border-white/30 transition" download>⬇️</a>
            </div>
        </div>
    </div>`;
}

// Switch TikTok/YouTube within a grouped card
function switchPlatform(title, platform) {
    activePlatform[title] = platform;
    renderClips();
}

// Approve/reject both TikTok + YouTube of same moment
async function approveMoment(title) {
    const clips = allClips.filter(c => c.title === title);
    for (const c of clips) {
        await fetch(`${API}/api/clips/${c.id}/approve`, { method: 'POST' });
        c.status = 'approved';
    }
    renderClips();
    loadStats();
    showToast(`Clip aprobado ✅`);
}

async function rejectMoment(title) {
    const clips = allClips.filter(c => c.title === title);
    for (const c of clips) {
        await fetch(`${API}/api/clips/${c.id}/reject`, { method: 'POST' });
        c.status = 'rejected';
    }
    renderClips();
    loadStats();
    showToast(`Clip rechazado ❌`);
}

// --- Single card (platform-specific filter view) ---
function renderSingleCard(clip) {
    const statusColors = {
        pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        approved: 'bg-green-500/20 text-green-400 border-green-500/30',
        rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const statusLabels = { pending: 'PENDIENTE', approved: 'APROBADO', rejected: 'RECHAZADO' };
    const platformIcon = clip.platform === 'tiktok' ? '🎵' : '▶️';
    const scoreBar = Math.min(clip.score * 10, 100);
    const caption = clip.platform === 'tiktok' ? clip.caption_tiktok : clip.caption_youtube;

    return `
    <div class="clip-card bg-card rounded-xl border border-border overflow-hidden" data-id="${clip.id}">
        <div class="relative aspect-[9/16] max-h-[360px] bg-black">
            <video class="w-full h-full object-contain" preload="metadata" controls src="/api/clips/${clip.id}/video"></video>
            <div class="absolute top-2 left-2 flex gap-1.5">
                <span class="status-badge px-2 py-0.5 rounded-full border ${statusColors[clip.status]}">${statusLabels[clip.status]}</span>
                <span class="status-badge px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/10">${platformIcon} ${clip.platform.toUpperCase()}</span>
            </div>
        </div>
        <div class="p-4">
            <h3 class="font-semibold text-sm leading-tight mb-2 line-clamp-2">${escapeHtml(clip.title)}</h3>
            <div class="flex items-center gap-2 mb-3">
                <span class="text-xs text-white/40">Score</span>
                <div class="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div class="h-full bg-neon rounded-full" style="width: ${scoreBar}%"></div>
                </div>
                <span class="text-xs font-semibold text-neon">${clip.score.toFixed(1)}</span>
            </div>
            <div class="caption-box text-xs text-white/50 bg-darker rounded-lg p-3 mb-3">
                <pre class="whitespace-pre-wrap font-sans">${escapeHtml(caption || 'Sin caption')}</pre>
                <button onclick="copyText(${JSON.stringify(caption || '')})" class="mt-2 text-neon hover:underline text-xs">📋 Copiar</button>
            </div>
            <div class="flex gap-2">
                ${clip.status !== 'approved' ? `<button onclick="approveClip(${clip.id})" class="btn-approve flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-neon/30 text-neon text-xs font-medium transition">✅ Aprobar</button>` : ''}
                ${clip.status !== 'rejected' ? `<button onclick="rejectClip(${clip.id})" class="btn-reject flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium transition">❌ Rechazar</button>` : ''}
                <a href="/api/clips/${clip.id}/download" class="flex items-center justify-center px-3 py-2 rounded-lg border border-border text-white/50 text-xs hover:text-white transition" download>⬇️</a>
            </div>
        </div>
    </div>`;
}

// --- Actions ---
async function approveClip(id) {
    await fetch(`${API}/api/clips/${id}/approve`, { method: 'POST' });
    const clip = allClips.find(c => c.id === id);
    if (clip) clip.status = 'approved';
    renderClips(); loadStats();
    showToast('Clip aprobado ✅');
}

async function rejectClip(id) {
    await fetch(`${API}/api/clips/${id}/reject`, { method: 'POST' });
    const clip = allClips.find(c => c.id === id);
    if (clip) clip.status = 'rejected';
    renderClips(); loadStats();
    showToast('Clip rechazado ❌');
}

// --- Utils ---
function formatDuration(s) {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Caption copiado ✅');
    } catch (e) {
        showToast('Error al copiar', 'error');
    }
}

function showToast(msg, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'bg-neon/20 text-neon border border-neon/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('filter-active');
