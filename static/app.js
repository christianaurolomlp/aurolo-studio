// Aurolo Studio — Frontend
const API = '';
let allClips = [];
let currentFilter = 'all';

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
    } catch (e) {
        console.error('Stats error:', e);
    }
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
        // Auto-select first stream
        if (streams.length > 0) {
            sel.value = streams[0].id;
            loadClips(streams[0].id);
        }
    } catch (e) {
        console.error('Streams error:', e);
    }
}

// --- Clips ---
async function loadClips(streamId) {
    try {
        const res = await fetch(`${API}/api/streams/${streamId}/clips`);
        allClips = await res.json();
        renderClips();
        document.getElementById('empty-state').classList.add('hidden');
    } catch (e) {
        console.error('Clips error:', e);
    }
}

function filterClips(filter) {
    currentFilter = filter;
    // Update button styles
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('filter-active');
        if (btn.dataset.filter === filter) btn.classList.add('filter-active');
    });
    renderClips();
}

function renderClips() {
    const grid = document.getElementById('clips-grid');
    let filtered = allClips;
    if (currentFilter === 'pending' || currentFilter === 'approved' || currentFilter === 'rejected') {
        filtered = allClips.filter(c => c.status === currentFilter);
    } else if (currentFilter === 'tiktok' || currentFilter === 'youtube') {
        filtered = allClips.filter(c => c.platform === currentFilter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-16">
                <p class="text-white/30">No hay clips con este filtro</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(clip => renderClipCard(clip)).join('');
}

function renderClipCard(clip) {
    const statusColors = {
        pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        approved: 'bg-green-500/20 text-green-400 border-green-500/30',
        rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const statusLabels = { pending: 'PENDIENTE', approved: 'APROBADO', rejected: 'RECHAZADO' };
    const platformIcon = clip.platform === 'tiktok' ? '🎵' : '▶️';
    const scoreBar = Math.min(clip.score * 10, 100);

    return `
    <div class="clip-card bg-card rounded-xl border border-border overflow-hidden" data-id="${clip.id}">
        <!-- Video -->
        <div class="relative aspect-[9/16] max-h-[360px] bg-black">
            <video class="w-full h-full object-contain" preload="metadata" controls
                src="/api/clips/${clip.id}/video"
                poster="">
            </video>
            <div class="absolute top-2 left-2 flex gap-1.5">
                <span class="status-badge px-2 py-0.5 rounded-full border ${statusColors[clip.status]}">
                    ${statusLabels[clip.status]}
                </span>
                <span class="status-badge px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/10">
                    ${platformIcon} ${clip.platform.toUpperCase()}
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

            <!-- Captions Tabs -->
            <div class="mb-3">
                <div class="flex gap-0 border-b border-border mb-2">
                    <button onclick="showCaption(${clip.id}, 'tiktok')" class="caption-tab text-xs px-3 py-1.5 tab-active" data-clip="${clip.id}" data-platform="tiktok">TikTok</button>
                    <button onclick="showCaption(${clip.id}, 'youtube')" class="caption-tab text-xs px-3 py-1.5 tab-inactive" data-clip="${clip.id}" data-platform="youtube">YouTube</button>
                </div>
                <div class="caption-box text-xs text-white/50 bg-darker rounded-lg p-3" id="caption-${clip.id}">
                    <pre class="whitespace-pre-wrap font-sans">${escapeHtml(clip.caption_tiktok || 'Sin caption')}</pre>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
                ${clip.status !== 'approved' ? `
                <button onclick="approveClip(${clip.id})" class="btn-approve flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-neon/30 text-neon text-xs font-medium transition">
                    ✅ Aprobar
                </button>` : ''}
                ${clip.status !== 'rejected' ? `
                <button onclick="rejectClip(${clip.id})" class="btn-reject flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium transition">
                    ❌ Rechazar
                </button>` : ''}
                <a href="/api/clips/${clip.id}/download" class="flex items-center justify-center px-3 py-2 rounded-lg border border-border text-white/50 text-xs hover:text-white hover:border-white/30 transition" download>
                    ⬇️
                </a>
            </div>
        </div>
    </div>
    `;
}

// --- Caption Tabs ---
function showCaption(clipId, platform) {
    const clip = allClips.find(c => c.id === clipId);
    if (!clip) return;

    const box = document.getElementById(`caption-${clipId}`);
    const caption = platform === 'tiktok' ? clip.caption_tiktok : clip.caption_youtube;
    box.innerHTML = `
        <pre class="whitespace-pre-wrap font-sans">${escapeHtml(caption || 'Sin caption')}</pre>
        <button onclick="copyCaption(${clipId}, '${platform}')" class="mt-2 text-neon hover:underline text-xs">📋 Copiar</button>
    `;

    // Update tab styles
    document.querySelectorAll(`.caption-tab[data-clip="${clipId}"]`).forEach(tab => {
        if (tab.dataset.platform === platform) {
            tab.classList.remove('tab-inactive');
            tab.classList.add('tab-active');
        } else {
            tab.classList.remove('tab-active');
            tab.classList.add('tab-inactive');
        }
    });
}

async function copyCaption(clipId, platform) {
    const clip = allClips.find(c => c.id === clipId);
    if (!clip) return;
    const text = platform === 'tiktok' ? clip.caption_tiktok : clip.caption_youtube;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Caption copiado ✅');
    } catch (e) {
        showToast('Error al copiar', 'error');
    }
}

// --- Actions ---
async function approveClip(id) {
    try {
        await fetch(`${API}/api/clips/${id}/approve`, { method: 'POST' });
        updateClipStatus(id, 'approved');
        showToast('Clip aprobado ✅');
        loadStats();
    } catch (e) {
        showToast('Error al aprobar', 'error');
    }
}

async function rejectClip(id) {
    try {
        await fetch(`${API}/api/clips/${id}/reject`, { method: 'POST' });
        updateClipStatus(id, 'rejected');
        showToast('Clip rechazado ❌');
        loadStats();
    } catch (e) {
        showToast('Error al rechazar', 'error');
    }
}

function updateClipStatus(id, status) {
    const clip = allClips.find(c => c.id === id);
    if (clip) {
        clip.status = status;
        renderClips();
    }
}

// --- Utils ---
function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// Init first filter
document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('filter-active');
