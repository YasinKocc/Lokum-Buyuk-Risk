
// Firebase configuratie
const firebaseConfig = {
    apiKey: "AIzaSyCHgvgR60SgF04ZQlUCw1mWuJSZmDNViXI",
    authDomain: "lokum-buyuk-risk.firebaseapp.com",
    databaseURL: "https://lokum-buyuk-risk-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "lokum-buyuk-risk",
    storageBucket: "lokum-buyuk-risk.firebasestorage.app",
    messagingSenderId: "242859600678",
    appId: "1:242859600678:web:7d7a149608e2aed7d16fe7",
    measurementId: "G-TL7CWLCE2B"
};

// Initialiseer Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();


const app = {

    data: {

        title: "Örnek Oyun",

        teamCount: 4, catCount: 5, rowCount: 5,

        categories: ["Tarih", "Bilim", "Müzik", "Teknoloji", "Karışık"],

        questions: []

    },

    scores: {},

    
    currentClue: null,

    gamesList: [],



    init: function () {
        document.getElementById('game-modal').style.display = 'none';

        // ALLEEN Firebase - GEEN localStorage
        this.loadGamesFromCloud();
        this.generateBuilderInputs();
        this.showView('home');
    },



    loadGamesFromCloud: function () {
        db.ref('games')
            .orderByChild('timestamp')
            .limitToLast(100)
            .on('value', snapshot => {
                this.gamesList = [];
                snapshot.forEach(child => {
                    const game = child.val();
                    game.id = child.key;
                    this.gamesList.push(game);
                });
                this.renderGameList();  // Live updates!
            });
    },




    renderGameList: function () {
        const listEl = document.getElementById('games-list-container');
        listEl.innerHTML = '';

        // NIEUWSTE EERST (Firebase timestamp)
        this.gamesList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (this.gamesList.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:10px;">Kaydedilmiş oyun yok. Bir tane oluşturun!</div>';
            return;
        }

        this.gamesList.forEach(game => {
            const el = document.createElement('div');
            el.className = 'game-item';
            const dateStr = new Date(game.timestamp || Date.now()).toLocaleDateString('tr-TR');
            el.innerHTML = `
            <div class="game-meta">
                <h4>${game.title || '[Adsız]'}</h4>
                <span>${game.catCount}x${game.rowCount} • ${dateStr}</span>
            </div>
            <div class="game-actions">
                <button class="btn btn-sm btn-danger" onclick="app.deleteGame('${game.id}')">Sil</button>
                <button class="btn btn-sm btn-secondary" onclick="app.loadGame('${game.id}')">Oyna</button>
            </div>
        `;
            listEl.appendChild(el);
        });
    },




    playLatestGame: function () {

        if (this.gamesList.length > 0) {

            this.loadGame(this.gamesList[0].id);

        } else {

            this.loadHardcodedDemo();

        }

    },



    loadGame: function (id) {
        // Oude listener opruimen
        if (this.gameListenerRef) {
            this.gameListenerRef.off('value');
        }

        // Real-time listener op Firebase
        this.gameListenerRef = db.ref(`games/${id}`);

        this.gameListenerRef.on('value', snap => {
            if (!snap.exists()) {
                console.warn('Game niet gevonden:', id);
                return;
            }

            // Live data uit Firebase laden (altijd up-to-date)
            this.data = snap.val();
            this.data.id = id;

            // Builder inputs syncen
            document.getElementById('game-title').value = this.data.title || '';
            document.getElementById('team-count').value = this.data.teamCount || 4;
            document.getElementById('cat-count').value = this.data.catCount || 5;
            document.getElementById('row-count').value = this.data.rowCount || 5;

            // Scores initialiseren uit Firebase (of 0)
            this.scores = this.data.scores || {};
            for (let i = 1; i <= this.data.teamCount; i++) {
                if (this.scores[i] == null) this.scores[i] = 0;
            }

            // Builder inputs genereren EN vragen vullen
            this.generateBuilderInputs();

            // Vragen uit Firebase in inputs terugzetten
            if (this.data.questions) {
                for (let c = 0; c < this.data.catCount; c++) {
                    for (let r = 0; r < this.data.rowCount; r++) {
                        if (this.data.questions[c] && this.data.questions[c][r]) {
                            const q = this.data.questions[c][r];
                            const qi = document.querySelector(`.inp-q[data-cat="${c}"][data-row="${r}"]`);
                            const ai = document.querySelector(`.inp-a[data-cat="${c}"][data-row="${r}"]`);
                            if (qi) qi.value = q.q || '';
                            if (ai) ai.value = q.a || '';
                        }
                    }
                }
            }

            // Grid + scoreboard renderen (met live solved status)
            this.renderGrid();
            this.renderScoreboard();

            // Live scores tonen
            for (let i = 1; i <= this.data.teamCount; i++) {
                const el = document.getElementById(`score-${i}`);
                if (el) el.innerText = this.scores[i] || 0;
            }

            document.getElementById('display-game-title').innerText = this.data.title || 'Unnamed Game';
            this.showView('game');

            console.log('Game geladen uit Firebase:', id);
        });
    },




    deleteGame: async function (id) {
        if (!confirm("Bu oyunu silmek istediğinize emin misiniz?")) return;
        await db.ref(`games/${id}`).remove();
    },




    saveGame: async function () {
        this.scrapeBuilderData();
        const gameRef = db.ref('games').push();
        const payload = {
            ...this.data,
            id: gameRef.key,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            scores: {},  // Lege scores voor nieuwe game
            questions: this.data.questions.map(row => row.map(q => ({ ...q, solved: false })))  // Alle unsolved
        };
        await gameRef.set(payload);
        alert("Oyun kaydedildi! 🎮");
        this.showView('home');
    },





    // Core Logic

    showView: function (id) {
        document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));
        document.getElementById('view-' + id).classList.add('active');
        document.getElementById('game-modal').style.display = 'none';  // ← TOEGEVOEGD
        document.getElementById('score-board').style.display = (id === 'game') ? 'flex' : 'none';
    },




    handleDimensionChange: function () {

        this.scrapeBuilderData();

        const cc = parseInt(document.getElementById('cat-count').value);

        const rc = parseInt(document.getElementById('row-count').value);

        this.data.catCount = Math.min(Math.max(cc, 1), 8);

        this.data.rowCount = Math.min(Math.max(rc, 1), 10);

        while (this.data.categories.length < this.data.catCount) this.data.categories.push("Yeni Kategori");

        this.generateBuilderInputs();

    },



    generateBuilderInputs: function () {

        const cc = this.data.catCount;

        const rc = this.data.rowCount;

        const cDiv = document.getElementById('category-inputs');

        const qDiv = document.getElementById('question-inputs');



        const style = `grid-template-columns: repeat(${cc}, 1fr);`;

        cDiv.style.cssText = style;

        qDiv.style.cssText = style;



        let cHtml = '';

        let qHtml = '';



        for (let c = 0; c < cc; c++) {

            cHtml += `<input type="text" class="cat-input" data-idx="${c}" placeholder="Kategori ${c + 1}" value="${this.data.categories[c] || ''}">`;

            let col = '<div class="q-col">';

            for (let r = 0; r < rc; r++) {

                let qv = '', av = '';

                if (this.data.questions[c] && this.data.questions[c][r]) {

                    qv = this.data.questions[c][r].q;

                    av = this.data.questions[c][r].a;

                }

                col += `

                        <div class="q-cell">

                            <h4>${(r + 1) * 100}</h4>

                            <input type="text" class="inp-q" data-cat="${c}" data-row="${r}" placeholder="Soru" value="${qv}">

                            <input type="text" class="inp-a" data-cat="${c}" data-row="${r}" placeholder="Cevap" value="${av}">

                        </div>

                    `;

            }

            col += '</div>';

            qHtml += col;

        }

        cDiv.innerHTML = cHtml;

        qDiv.innerHTML = qHtml;

    },



    scrapeBuilderData: function () {

        this.data.title = document.getElementById('game-title').value;

        this.data.teamCount = parseInt(document.getElementById('team-count').value) || 4;

        const cis = document.querySelectorAll('.cat-input');

        this.data.categories = [];

        cis.forEach(i => this.data.categories.push(i.value));



        this.data.questions = [];

        for (let c = 0; c < this.data.catCount; c++) {

            this.data.questions[c] = [];

            for (let r = 0; r < this.data.rowCount; r++) {

                const qi = document.querySelector(`.inp-q[data-cat="${c}"][data-row="${r}"]`);

                const ai = document.querySelector(`.inp-a[data-cat="${c}"][data-row="${r}"]`);

                this.data.questions[c][r] = {

                    q: qi ? qi.value : '', a: ai ? ai.value : '', value: (r + 1) * 100, solved: false

                };

            }

        }

    },



    startGame: function () {
        // Builder data ophalen
        this.scrapeBuilderData();

        // Scores resetten naar 0
        this.scores = {};
        for (let i = 1; i <= this.data.teamCount; i++) {
            this.scores[i] = 0;
        }

        // Alle vragen als unsolved markeren
        for (let c = 0; c < this.data.catCount; c++) {
            for (let r = 0; r < this.data.rowCount; r++) {
                if (this.data.questions[c] && this.data.questions[c][r]) {
                    this.data.questions[c][r].solved = false;
                }
            }
        }

        // 🔥 FIREBASE: Reset scores EN questions in één keer
        if (this.data.id) {
            const gameRef = db.ref(`games/${this.data.id}`);

            // Scores resetten in Firebase
            gameRef.child('scores').set(this.scores);

            // Questions resetten in Firebase (alle solved = false)
            gameRef.child('questions').set(this.data.questions);

            console.log('Game gereset in Firebase:', this.data.id);
        }

        // UI updaten
        this.renderGrid();           // Grid met alle vragen zichtbaar
        this.renderScoreboard();     // Scoreboard met 0'en
        document.getElementById('display-game-title').innerText = this.data.title;
        this.showView('game');

        // Scores direct in UI tonen
        for (let i = 1; i <= this.data.teamCount; i++) {
            const el = document.getElementById(`score-${i}`);
            if (el) el.innerText = '0';
        }

        console.log('Game gestart - alle scores 0, vragen unsolved');
    },




    renderGrid: function () {

        const g = document.getElementById('game-grid');

        g.innerHTML = '';

        g.style.gridTemplateColumns = `repeat(${this.data.catCount}, 1fr)`;



        this.data.categories.forEach(cat => {

            const d = document.createElement('div');

            d.className = 'category-card'; d.innerText = cat || 'Kategori';

            g.appendChild(d);

        });



        for (let r = 0; r < this.data.rowCount; r++) {

            for (let c = 0; c < this.data.catCount; c++) {

                const q = this.data.questions[c] ? this.data.questions[c][r] : null;

                const d = document.createElement('div');

                if (q) {

                    d.className = `clue-card ${q.solved ? 'disabled' : ''}`;

                    d.innerText = q.solved ? '' : `${q.value}`;

                    d.onclick = () => this.openClue(c, r);

                } else {

                    d.className = 'clue-card disabled';

                }

                g.appendChild(d);

            }

        }

    },



    renderScoreboard: function () {

        const c = document.getElementById('scoreboard-container');

        c.innerHTML = '';

        for (let i = 1; i <= this.data.teamCount; i++) {

            const d = document.createElement('div'); d.className = 'score-team';

            d.innerHTML = `<span>Takım ${i}</span><span id="score-${i}" class="score-val">0</span>`;

            c.appendChild(d);

        }

    },



    openClue: function (c, r) {
        const q = this.data.questions[c][r];
        if (q.solved) return;

        this.currentClue = { c, r, val: q.value };
        this.teamScored = {}; // <-- TOEVOEGD: Reset de score-status voor de nieuwe clue

        document.getElementById('modal-question').innerText = q.q || "Soru metni yok";
        document.getElementById('modal-answer').innerText = q.a || "Cevap metni yok";
        document.getElementById('modal-answer').style.display = 'none';
        document.getElementById('modal-scoring').style.display = 'none';
        document.getElementById('btn-reveal').style.display = 'inline-block';
        document.getElementById('btn-close').style.display = 'none';
        const mc = document.getElementById('modal-score-container');

        mc.innerHTML = '';
        for (let i = 1; i <= this.data.teamCount; i++) {
            const d = document.createElement('div');
            d.className = 'team-control'; d.id = `mt-${i}`;
            d.innerHTML = `<span>Takım ${i}</span><div class="score-btns-wrapper">
                    <button class="mini-btn btn-correct" onclick="app.score(${i},true)">✓</button>
                    <button class="mini-btn btn-wrong" onclick="app.score(${i},false)">✗</button>
                </div>`;
            mc.appendChild(d);
        }
        document.getElementById('game-modal').style.display = 'flex';
    },



    revealAnswer: function () {

        document.getElementById('modal-answer').style.display = 'block';

        document.getElementById('modal-scoring').style.display = 'block';

        document.getElementById('btn-reveal').style.display = 'none';

        document.getElementById('btn-close').style.display = 'inline-block';

    },



score: function (tid, correct) {
        console.log(`Scoring team ${tid}, correct: ${correct}, currentClue:`, this.currentClue);

        if (!this.currentClue) {
            console.error('Geen currentClue!');
            return;
        }

        if (this.teamScored[tid]) {
            alert(`Takım ${tid} zaten puan aldı/bildi!`);
            return;
        }

        this.teamScored[tid] = true;
        const pts = correct ? this.currentClue.val : -this.currentClue.val;

        // Score updaten
        this.scores[tid] = (this.scores[tid] || 0) + pts; //

        // UI updaten
        const el = document.getElementById(`score-${tid}`);
        if (el) el.innerText = `${this.scores[tid]}`; //

        const te = document.getElementById(`mt-${tid}`);
        if (te) {
            te.classList.remove('anim-correct', 'anim-wrong');
            void te.offsetWidth;
            te.classList.add(correct ? 'anim-correct' : 'anim-wrong');
        }

        // 🔥 FIREBASE: Live score sync naar database
        if (this.data.id) {
            db.ref(`games/${this.data.id}/scores/${tid}`).set(this.scores[tid]);
            console.log(`Team ${tid} score opgeslagen in Firebase: ${this.scores[tid]}`);
        }

        // Check of alle teams gescoord hebben (geen actie volgt, sluiten blijft manueel)
        const allTeamsScored = Object.keys(this.teamScored).length === this.data.teamCount;
        console.log(`Teams gescoord: ${Object.keys(this.teamScored).length}/${this.data.teamCount}`);
    },



    closeModal: function () {

        if (this.currentClue) {

            this.data.questions[this.currentClue.c][this.currentClue.r].solved = true;

            this.renderGrid();

        }

        document.getElementById('game-modal').style.display = 'none';

    },



    loadHardcodedDemo: function () {

        this.data.title = "Örnek Oyun";

        this.data.catCount = 5; this.data.rowCount = 5;

        this.data.categories = ["Coğrafya", "Bilim", "Sanat", "Teknoloji", "Karışık"];

        this.data.questions = [];

        for (let c = 0; c < 5; c++) {

            this.data.questions[c] = [];

            for (let r = 0; r < 5; r++) {

                this.data.questions[c][r] = { q: "Örnek Soru", a: "Örnek Cevap", value: (r + 1) * 100, solved: false };

            }

        }

        this.generateBuilderInputs();

        this.startGame();

    }

};



window.app = app;

window.addEventListener('load', () => app.init());
