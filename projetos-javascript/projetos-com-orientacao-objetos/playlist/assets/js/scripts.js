/* =========================
   MODELOS (DOMÍNIO)
   ========================= */
class Track{
  /** @param {{id:string,title:string,artist?:string,audioUrl?:string,color?:string}} data */
  constructor(data){
    this.id = data.id;
    this.title = data.title;
    this.artist = data.artist ?? "Artista";
    this.audioUrl = data.audioUrl ?? "";
    this.color = data.color ?? null; // permite customizar a capa
  }
}

class Playlist{
  constructor(tracks = []){
    /** @type {Track[]} */
    this.tracks = tracks;
    this.index = 0;
  }
  setIndex(i){
    if(!this.tracks.length) return;
    this.index = ( (i % this.tracks.length) + this.tracks.length ) % this.tracks.length;
  }
  current(){ return this.tracks[this.index] ?? null; }
  next(){ this.setIndex(this.index + 1); return this.current(); }
  prev(){ this.setIndex(this.index - 1); return this.current(); }
  byId(id){ return this.tracks.find(t => t.id === id) ?? null; }
}

/* =========================
   ÁUDIO (REGRA/INFRA)
   ========================= */
class AudioEngine{
  constructor(){
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this._onTime = () => {};
    this._onEnd = () => {};
    this.audio.addEventListener("timeupdate", () => this._onTime(this.timeInfo()));
    this.audio.addEventListener("ended", () => this._onEnd());
  }

  /** @param {(info:{current:number, duration:number, percent:number})=>void} cb */
  onTime(cb){ this._onTime = cb; }
  /** @param {()=>void} cb */
  onEnd(cb){ this._onEnd = cb; }

  /** @param {Track} track */
  async load(track){
    if(!track || !track.audioUrl){
      // Sem arquivo? Usa um som gerado (beep curtinho) via WebAudio DataURI
      // 0.25s senóide a 440Hz gerada em PCM 8-bit mono
      this.audio.src = this._tinyBeepDataURI();
    }else{
      this.audio.src = track.audioUrl;
    }
    await this.audio.load?.();
  }
  play(){ return this.audio.play(); }
  pause(){ this.audio.pause(); }
  toggle(){ this.audio.paused ? this.play() : this.pause(); }
  seekPercent(p){ if(this.audio.duration>0){ this.audio.currentTime = p * this.audio.duration; } }

  timeInfo(){
    const d = this.audio.duration || 0;
    const c = this.audio.currentTime || 0;
    const percent = d ? Math.min(1, Math.max(0, c/d)) : 0;
    return { current:c, duration:d, percent };
  }

  _tinyBeepDataURI(){
    // Gera um áudio PCM 8-bit 8kHz com ~0.25s de seno A4
    const sampleRate = 8000, seconds = 0.25, len = sampleRate * seconds | 0, freq=440;
    const header = "RIFF????WAVEfmt "+String.fromCharCode(16,0,0,0,1,0,1,0,
                     sampleRate&255,(sampleRate>>8)&255,(sampleRate>>16)&255,(sampleRate>>24)&255,
                     1,0,8,0)+"data????";
    let data = "";
    for(let i=0;i<len;i++){
      const v = Math.sin(2*Math.PI*freq*i/sampleRate);
      const u8 = (v*0.35 + 0.5)*255 | 0; // volume baixo
      data += String.fromCharCode(u8);
    }
    // Corrige tamanhos no cabeçalho
    const totalSize = 36 + data.length;
    const chunkSize = data.length;
    function u32(n){ return String.fromCharCode(n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255); }
    const wav = header.replace("????", u32(totalSize).slice(0,4))
                      .replace("????", u32(chunkSize).slice(0,4)) + data;
    return "data:audio/wav;base64," + btoa(wav);
  }
}

/* =========================
   UI (APRESENTAÇÃO)
   ========================= */
class PlayerUI{
  /** @param {Playlist} playlist @param {AudioEngine} engine */
  constructor(playlist, engine){
    this.playlist = playlist;
    this.engine = engine;

    // DOM
    this.grid = document.getElementById("grid");
    this.playBtn = document.getElementById("playBtn");
    this.playIcon = document.getElementById("playIcon");
    this.prevBtn = document.getElementById("prevBtn");
    this.nextBtn = document.getElementById("nextBtn");
    this.nowPlaying = document.getElementById("nowPlaying");
    this.progress = document.getElementById("progress");
    this.progressBar = document.getElementById("progressBar");
    this.progressSr = document.getElementById("progressSr");
    this.time = document.getElementById("time");

    // Eventos
    this.playBtn.addEventListener("click", () => this.engine.toggle());
    this.prevBtn.addEventListener("click", () => this.play(this.playlist.prev()));
    this.nextBtn.addEventListener("click", () => this.play(this.playlist.next()));
    this.progress.addEventListener("click", (e) => {
      const r = this.progress.getBoundingClientRect();
      const p = (e.clientX - r.left) / r.width;
      this.engine.seekPercent(Math.max(0, Math.min(1, p)));
    });
    window.addEventListener("keydown", (e)=>{
      if(e.code === "Space"){ e.preventDefault(); this.engine.toggle(); }
      if(e.code === "ArrowRight"){ this.play(this.playlist.next()); }
      if(e.code === "ArrowLeft"){ this.play(this.playlist.prev()); }
    });

    this.engine.onTime((info)=> this._updateProgress(info));
    this.engine.onEnd(()=> this.play(this.playlist.next()));

    this.renderGrid();
  }

  renderGrid(){
    this.grid.innerHTML = "";
    this.playlist.tracks.forEach((t,idx)=>{
      const el = document.createElement("button");
      el.className = "track";
      el.setAttribute("data-id", t.id);
      el.setAttribute("aria-label", `Tocar ${t.title} de ${t.artist}`);
      el.innerHTML = `
        <span class="cover" style="${t.color ? `background:${t.color}` : ''}"></span>
        <span class="meta">
          <span class="title">${t.title}</span>
          <span class="subtitle">${t.artist}</span>
        </span>`;
      el.addEventListener("click", ()=>{ this.playlist.setIndex(idx); this.play(t); });
      this.grid.appendChild(el);
    });
    this._markCurrent();
  }

  async play(track){
    if(!track) return;
    await this.engine.load(track);
    this.engine.play();
    this._markCurrent();
    this._updatePlayState(true);
    this.nowPlaying.textContent = `${track.title} — ${track.artist}`;
    document.title = `▶ ${track.title} — Player`;
  }

  _markCurrent(){
    const id = this.playlist.current()?.id;
    document.querySelectorAll(".track").forEach(el=>{
      el.classList.toggle("is-current", el.getAttribute("data-id") === id);
    });
  }

  _updatePlayState(isPlaying){
    // alterna ícone play/pause
    this.playIcon.className = "icon " + (isPlaying ? "pause" : "play");
    this.playBtn.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproduzir");
  }

  _updateProgress({current, duration, percent}){
    const pct = Math.round(percent*100);
    this.progressBar.style.width = pct + "%";
    this.progress.setAttribute("aria-valuenow", String(pct));
    this.progressSr.textContent = pct + "%";
    this.time.textContent = this._fmt(current) + (duration? " / " + this._fmt(duration) : "");
    this._updatePlayState(!this.engine.audio.paused);
  }

  _fmt(sec){
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return `${m}:${String(s).padStart(2,'0')}`;
  }
}

/* =========================
   BOOTSTRAP
   ========================= */
const demoTracks = [
  new Track({ id:"1", title:"Música player", artist:"Canal A", audioUrl:"assets/musics/1.mp3", color:"#12c274" }),
  new Track({ id:"2", title:"Música player", artist:"Canal B", audioUrl:"assets/audio2.mp3", color:"#10b26a" }),
  new Track({ id:"3", title:"Música player", artist:"Canal C", audioUrl:"assets/audio3.mp3", color:"#0fb366" }),
  new Track({ id:"4", title:"Música player", artist:"Canal D", audioUrl:"assets/audio4.mp3", color:"#11a35f" }),
  new Track({ id:"5", title:"Música player", artist:"Canal E", audioUrl:"assets/audio5.mp3" }),
  new Track({ id:"6", title:"Música player", artist:"Canal F", audioUrl:"assets/audio6.mp3" }),
  new Track({ id:"7", title:"Música player", artist:"Canal G", audioUrl:"assets/audio7.mp3" }),
  new Track({ id:"8", title:"Música player", artist:"Canal H", audioUrl:"assets/audio8.mp3" }),
  new Track({ id:"9", title:"Música player", artist:"Canal I", audioUrl:"assets/audio9.mp3" }),
  new Track({ id:"10", title:"Música player", artist:"Canal J", audioUrl:"assets/audio10.mp3" }),
  new Track({ id:"11", title:"Música player", artist:"Canal K", audioUrl:"assets/audio11.mp3" }),
  new Track({ id:"12", title:"Música player", artist:"Canal L", audioUrl:"assets/audio12.mp3" }),
];

const playlist = new Playlist(demoTracks);
const engine = new AudioEngine();
const ui = new PlayerUI(playlist, engine);

// Começa selecionando a primeira (sem tocar automaticamente)
ui._markCurrent();