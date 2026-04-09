// Aurolo Studio — Frontend (Linear Dark Design)
const API = '';
let allClips = [];
let currentFilter = 'all';
let activePlatform = {};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadStreams();
    document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('filter-active');
});

// --- Stats ---
async function loadStats() {
    try {
        const res = await fetch(`${API}/api/stats`);
        const s = await res.json();

        // Update pending badge in header
        const pendingBadge = document.getElementById('pending-badge');
        const pendingCount = document.getElementById('pending-count');
        if (s.pending > 0) {
            pendingBadge.style.display = 'inline-flex';
            pendingCount.textContent = s.pending;
        } else {
            pendingBadge.style.display = 'none';
        }

        document.getElementById('stats-bar').innerHTML = `
            <div class="stat-item">
                <span class="stat-dot accent"></span>
                <span class="stat-value">${s.total_clips}</span> clips
            </div>
            <div class="stat-item">
                <span class="stat-dot green"></span>
                <span class="stat-value">${s.approved}</span> aprobados
            </div>
            <div class="stat-item">
                <span class="stat-dot yellow"></span>
                <span class="stat-value">${s.pending}</span> pendientes
            </div>
            <div class="stat-item">
                ${s.tiktok} TT · ${s.youtube} YT
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
    let filtered = allClips;

    if (['pending', 'approved', 'rejected'].includes(currentFilter)) {
        filtered = allClips.filter(c => c.status === currentFilter);
    } else if (currentFilter === 'tiktok' || currentFilter === 'youtube') {
        filtered = allClips.filter(c => c.platform === currentFilter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full empty-state" style="padding:60px 20px"><p class="empty-text">No hay clips con este filtro</p></div>`;
        return;
    }

    if (['all', 'pending', 'approved', 'rejected'].includes(currentFilter)) {
        const groups = groupClipsByMoment(filtered);
        grid.innerHTML = groups.map(g => renderGroupCard(g)).join('');
    } else {
        grid.innerHTML = filtered.map(clip => renderSingleCard(clip)).join('');
    }
}

// --- Grouped card ---
function renderGroupCard(group) {
    const key = group.title;
    const platform = activePlatform[key] || (group.tiktok ? 'tiktok' : 'youtube');
    // If no youtube clip, fall back to tiktok clip (same video, different caption)
    const clip = group[platform] || group.tiktok || group.youtube;
    if (!clip) return '';

    const statusClass = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };
    const statusLabel = { pending: 'PENDIENTE', approved: 'APROBADO', rejected: 'RECHAZADO' };
    const scoreBar = Math.min(clip.score * 10, 100);
    // Always use caption for selected platform tab regardless of which clip record we have
    const caption = platform === 'tiktok' ? (clip.caption_tiktok || clip.caption_youtube) : (clip.caption_youtube || clip.caption_tiktok);

    return `
    <div class="clip-card" data-id="${clip.id}" id="group-${encodeURIComponent(key)}">
        <div class="clip-video-wrap">
            <video preload="metadata" controls src="/api/clips/${clip.id}/video"></video>
            <div class="clip-badges">
                <span class="status-badge ${statusClass[clip.status]}">${statusLabel[clip.status]}</span>
            </div>
            ${clip.duration ? `<span class="clip-duration">${formatDuration(clip.duration)}</span>` : ''}
        </div>
        <div class="clip-info">
            <h3 class="clip-title">${escapeHtml(clip.title)}</h3>

            <div class="score-row">
                <span class="score-label">Score</span>
                <div class="score-track">
                    <div class="score-fill" style="width: ${scoreBar}%"></div>
                </div>
                <span class="score-value">${clip.score.toFixed(1)}</span>
            </div>

            <div class="platform-toggle">
                <button onclick="switchPlatform('${escapeHtml(key)}', 'tiktok')"
                    class="platform-btn ${platform === 'tiktok' ? 'active-tiktok' : ''}">
                    🎵 TikTok
                </button>
                <button onclick="switchPlatform('${escapeHtml(key)}', 'youtube')"
                    class="platform-btn ${platform === 'youtube' ? 'active-youtube' : ''}">
                    ▶️ YouTube
                </button>
            </div>

            <div class="caption-box">
                <pre>${escapeHtml(caption || 'Sin caption')}</pre>
                <button onclick="copyText(${JSON.stringify(caption || '')})" class="caption-copy">📋 Copiar</button>
            </div>

            <div class="clip-actions">
                ${clip.status !== 'approved' ? `<button onclick="approveMoment('${escapeHtml(key)}')" class="btn-action btn-approve">✅ Aprobar</button>` : ''}
                ${clip.status !== 'rejected' ? `<button onclick="rejectMoment('${escapeHtml(key)}')" class="btn-action btn-reject">❌ Rechazar</button>` : ''}
                <a href="/api/clips/${clip.id}/download" class="btn-action btn-download" download>⬇️</a>
            </div>
        </div>
    </div>`;
}

function switchPlatform(title, platform) {
    activePlatform[title] = platform;
    // Only re-render the affected card, not the whole grid
    const cardId = 'group-' + encodeURIComponent(title);
    const card = document.getElementById(cardId);
    if (!card) { renderClips(); return; }

    // Find the group
    const groups = groupClipsByMoment(allClips);
    const group = groups.find(g => g.title === title);
    if (!group) { renderClips(); return; }

    // Replace just this card
    const newCard = document.createElement('div');
    newCard.innerHTML = renderGroupCard(group);
    const newCardEl = newCard.firstElementChild;
    card.replaceWith(newCardEl);
}

async function approveMoment(title) {
    const clips = allClips.filter(c => c.title === title);
    for (const c of clips) {
        await fetch(`${API}/api/clips/${c.id}/approve`, { method: 'POST' });
        c.status = 'approved';
    }
    renderClips(); loadStats();
    showToast('Clip aprobado ✅');
}

async function rejectMoment(title) {
    const clips = allClips.filter(c => c.title === title);
    for (const c of clips) {
        await fetch(`${API}/api/clips/${c.id}/reject`, { method: 'POST' });
        c.status = 'rejected';
    }
    renderClips(); loadStats();
    showToast('Clip rechazado ❌');
}

// --- Single card ---
function renderSingleCard(clip) {
    const statusClass = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };
    const statusLabel = { pending: 'PENDIENTE', approved: 'APROBADO', rejected: 'RECHAZADO' };
    const platformIcon = clip.platform === 'tiktok' ? '🎵' : '▶️';
    const scoreBar = Math.min(clip.score * 10, 100);
    const caption = clip.platform === 'tiktok' ? clip.caption_tiktok : clip.caption_youtube;

    return `
    <div class="clip-card" data-id="${clip.id}">
        <div class="clip-video-wrap">
            <video preload="metadata" controls src="/api/clips/${clip.id}/video"></video>
            <div class="clip-badges">
                <span class="status-badge ${statusClass[clip.status]}">${statusLabel[clip.status]}</span>
                <span class="platform-badge">${platformIcon} ${clip.platform.toUpperCase()}</span>
            </div>
        </div>
        <div class="clip-info">
            <h3 class="clip-title">${escapeHtml(clip.title)}</h3>
            <div class="score-row">
                <span class="score-label">Score</span>
                <div class="score-track">
                    <div class="score-fill" style="width: ${scoreBar}%"></div>
                </div>
                <span class="score-value">${clip.score.toFixed(1)}</span>
            </div>
            <div class="caption-box">
                <pre>${escapeHtml(caption || 'Sin caption')}</pre>
                <button onclick="copyText(${JSON.stringify(caption || '')})" class="caption-copy">📋 Copiar</button>
            </div>
            <div class="clip-actions">
                ${clip.status !== 'approved' ? `<button onclick="approveClip(${clip.id})" class="btn-action btn-approve">✅ Aprobar</button>` : ''}
                ${clip.status !== 'rejected' ? `<button onclick="rejectClip(${clip.id})" class="btn-action btn-reject">❌ Rechazar</button>` : ''}
                <a href="/api/clips/${clip.id}/download" class="btn-action btn-download" download>⬇️</a>
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
    toast.className = `toast ${type === 'success' ? 'toast-success' : 'toast-error'}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
