// Application State
const AppState = {
    players: [],
    goalkeepers: [],
    currentGame: null,
    gameHistory: [],
    teamHistory: [],
    sessionActive: false,
    currentScreen: 'player-entries',
    currentTeams: null, // Store teams for Team Selection screen
    previousTeams: null, // Store previous team lineup for rematch
    teamEditMode: false, // Track whether team editing is active
    currentStartingLineup: null, // { blackTeam: id[], whiteTeam: id[] } when starting lineup enabled
    settings: {
        assistsEnabled: true, // Default ON
        maxScoreEnabled: false, // Default OFF
        maxScore: 5, // Default, only used when maxScoreEnabled is true
        pigAwardEnabled: true, // Default ON (pig award enabled by default)
        randomTeamsEnabled: true, // Default ON
        startingLineupEnabled: false, // Default OFF
        startingLineupCount: 5, // Number of starting players per team (3-11)
        blackTeamName: 'BLACK TEAM', // Default
        whiteTeamName: 'WHITE TEAM', // Default
        goalkeepersEnabled: false // Default OFF
    },
    goalRegistration: {
        team: null,
        scorer: null,
        assist: null
    },
    viewingTeamsFromGame: false,
    teamAddPlayerMode: false, // Show per-team add controls on View Teams during game
    teamRemovePlayerMode: false, // Show per-player remove controls on View Teams during game
    teamShuffleAnimating: false,
    todaysStatsView: 'field', // 'field' | 'gk'
    editingGameIndex: null // index into gameHistory when editing from View Games
};

// Recurring players are stored separately from the session so they
// persist across resets of players/games.
let RecurringPlayers = [];
const SESSION_STORAGE_KEY = 'tavelplay2Session';
const RECURRING_PLAYERS_STORAGE_KEY = 'tavelplay2RecurringPlayers';
let recurringManageOpen = false;

let teamSelectionCountdownInterval = null;
let startGameCountdownInterval = null;
let teamShuffleTimer = null;
const TEAM_SHUFFLE_DURATION_MS = 4000;

// Initialize App
function initApp() {
    loadSession();
    loadRecurringPlayers();
    setupEventListeners();
    showScreen('player-entries');
    updateStandings();
    renderPlayerEntries();
    renderSettings();
    applyTeamColors();
}

// State Management
function saveSession() {
    const sessionData = {
        players: AppState.players,
        goalkeepers: AppState.goalkeepers,
        gameHistory: AppState.gameHistory,
        teamHistory: AppState.teamHistory,
        sessionActive: AppState.sessionActive,
        settings: AppState.settings
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
}

function loadSession() {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
        const data = JSON.parse(saved);
        AppState.players = data.players || [];
        // Ensure all players have active property and MVP / plusMinus fields for backwards compatibility
        AppState.players.forEach(player => {
            if (player.active === undefined) {
                player.active = true;
            }
            if (player.pointsInWins === undefined) {
                player.pointsInWins = 0;
            }
            if (player.decisiveGoals === undefined) {
                player.decisiveGoals = 0;
            }
            if (player.decisiveAssists === undefined) {
                player.decisiveAssists = 0;
            }
            if (player.gamesPlayed === undefined) {
                player.gamesPlayed = 0;
            }
            if (player.plusMinus === undefined) {
                player.plusMinus = 0;
            }
        });
        AppState.goalkeepers = (data.goalkeepers || []).map(gk => {
            return {
                id: gk.id,
                name: gk.name,
                gamesAsGK: gk.gamesAsGK !== undefined ? gk.gamesAsGK : 0,
                goalsConceded: gk.goalsConceded !== undefined ? gk.goalsConceded : 0,
                cleanSheets: gk.cleanSheets !== undefined ? gk.cleanSheets : 0,
                winsAsGK: gk.winsAsGK !== undefined ? gk.winsAsGK : 0
            };
        });
        AppState.gameHistory = data.gameHistory || [];
        AppState.teamHistory = data.teamHistory || [];
        AppState.sessionActive = data.sessionActive || false;
        // Load settings with defaults if missing
        AppState.settings = {
            assistsEnabled: data.settings?.assistsEnabled !== undefined ? data.settings.assistsEnabled : true,
            maxScoreEnabled: data.settings?.maxScoreEnabled !== undefined ? data.settings.maxScoreEnabled : false,
            maxScore: data.settings?.maxScore !== undefined ? data.settings.maxScore : 5,
            pigAwardEnabled: data.settings?.pigAwardEnabled !== undefined ? data.settings.pigAwardEnabled : true,
            randomTeamsEnabled: data.settings?.randomTeamsEnabled !== undefined ? data.settings.randomTeamsEnabled : true,
            startingLineupEnabled: data.settings?.startingLineupEnabled !== undefined ? data.settings.startingLineupEnabled : false,
            startingLineupCount: data.settings?.startingLineupCount !== undefined ? data.settings.startingLineupCount : 5,
             goalkeepersEnabled: data.settings?.goalkeepersEnabled !== undefined ? data.settings.goalkeepersEnabled : false,
            blackTeamName: (() => {
                const v = data.settings?.blackTeamName || 'BLACK TEAM';
                const valid = ['BLACK TEAM', 'WHITE TEAM', 'BLUE TEAM', 'RED TEAM', 'YELLOW TEAM', 'GREEN TEAM', 'ORANGE TEAM', 'PURPLE TEAM'];
                return valid.includes(v) ? v : 'BLACK TEAM';
            })(),
            whiteTeamName: (() => {
                const v = data.settings?.whiteTeamName || 'WHITE TEAM';
                const valid = ['BLACK TEAM', 'WHITE TEAM', 'BLUE TEAM', 'RED TEAM', 'YELLOW TEAM', 'GREEN TEAM', 'ORANGE TEAM', 'PURPLE TEAM'];
                return valid.includes(v) ? v : 'WHITE TEAM';
            })()
        };
    }
}

// Recurring players persistence (separate from session data)
function loadRecurringPlayers() {
    try {
        const saved = localStorage.getItem(RECURRING_PLAYERS_STORAGE_KEY);
        if (!saved) {
            RecurringPlayers = [];
            return;
        }
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            RecurringPlayers = parsed
                .filter(p => p && typeof p.name === 'string')
                .map(p => ({
                    id: typeof p.id === 'string' ? p.id : `rp-${Date.now().toString()}`,
                    name: p.name
                }));
        } else {
            RecurringPlayers = [];
        }
    } catch (e) {
        RecurringPlayers = [];
    }
}

function saveRecurringPlayers() {
    try {
        localStorage.setItem(
            RECURRING_PLAYERS_STORAGE_KEY,
            JSON.stringify(RecurringPlayers)
        );
    } catch (e) {
        // Ignore storage errors
    }
}

function updateRecurringManageUI() {
    const panel = document.getElementById('recurring-players-manage');
    const btn = document.getElementById('recurring-manage-toggle-btn');
    if (panel) panel.style.display = recurringManageOpen ? 'block' : 'none';
    if (btn) btn.textContent = recurringManageOpen ? 'CLOSE' : 'MANAGE';
}

function addRecurringPlayerFromSettings(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return false;
    const exists = RecurringPlayers.some(
        p => (p.name || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return false;
    RecurringPlayers.push({ id: `rp-${Date.now().toString()}`, name: trimmed });
    saveRecurringPlayers();
    renderSettings();
    renderRecurringPlayersDropdown();
    return true;
}

function resetSession() {
    AppState.players = [];
    AppState.goalkeepers = [];
    AppState.currentGame = null;
    AppState.gameHistory = [];
    AppState.teamHistory = [];
    AppState.sessionActive = false;
    AppState.currentTeams = null;
    AppState.previousTeams = null;
    AppState.currentStartingLineup = null;
    // Reset settings to defaults including team names
    AppState.settings.goalkeepersEnabled = false;
    AppState.settings.blackTeamName = 'BLACK TEAM';
    AppState.settings.whiteTeamName = 'WHITE TEAM';
    AppState.todaysStatsView = 'field';
    localStorage.removeItem(SESSION_STORAGE_KEY);
}

// Helper function to get team display name
function getTeamName(team) {
    return team === 'black' ? AppState.settings.blackTeamName : AppState.settings.whiteTeamName;
}

function getTeamColorKey(teamName) {
    if (!teamName) return 'black';
    const key = teamName.replace(/\s*TEAM\s*$/i, '').toLowerCase();
    const valid = ['black', 'white', 'blue', 'red', 'yellow', 'green', 'orange', 'purple'];
    return valid.includes(key) ? key : 'black';
}

function applyTeamColors() {
    const blackName = AppState.settings.blackTeamName;
    const whiteName = AppState.settings.whiteTeamName;
    const leftColor = getTeamColorKey(blackName);
    const rightColor = getTeamColorKey(whiteName);

    const leftSection = document.querySelector('.team-section.team-black');
    const rightSection = document.querySelector('.team-section.team-white');
    if (leftSection) leftSection.setAttribute('data-team-color', leftColor);
    if (rightSection) rightSection.setAttribute('data-team-color', rightColor);

    const scoreBlack = document.querySelector('.score-team.score-black');
    const scoreWhite = document.querySelector('.score-team.score-white');
    if (scoreBlack) scoreBlack.setAttribute('data-team-color', leftColor);
    if (scoreWhite) scoreWhite.setAttribute('data-team-color', rightColor);

    const blackGoalBtn = document.getElementById('black-goal-btn');
    const whiteGoalBtn = document.getElementById('white-goal-btn');
    if (blackGoalBtn) blackGoalBtn.setAttribute('data-team-color', leftColor);
    if (whiteGoalBtn) whiteGoalBtn.setAttribute('data-team-color', rightColor);

    const finalTeams = document.querySelectorAll('.final-score-display .final-score-team');
    if (finalTeams.length >= 2) {
        finalTeams[0].setAttribute('data-team-color', leftColor);
        finalTeams[1].setAttribute('data-team-color', rightColor);
    }
}

function getTeamNameShort(team) {
    // Return short version (without "TEAM") for compact displays
    const fullName = getTeamName(team);
    return fullName.replace(/\s+TEAM\s*$/i, '').trim() || fullName;
}

// Screen Management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const screen = document.getElementById(`screen-${screenId}`);
    if (screen) {
        screen.classList.add('active');
        AppState.currentScreen = screenId;
        
        // Reset to player entries view when showing player entries screen
        if (screenId === 'player-entries') {
            showPlayerEntriesView();
        }
        
        // Show legends sidebar when Today's Stats is shown
        if (screenId === 'todays-stats') {
            renderLegends();
            setTimeout(() => adjustStatsFontSize(), 0);
        } else {
            // Restore standings sidebar for other screens
            renderStandingsSidebar();
        }
    }
    
    // When showing team selection, update footer (normal vs "viewing from game" with Back to Game)
    if (screenId === 'team-selection') {
        updateTeamSelectionFooter();
    } else {
        clearTeamSelectionCountdown();
        clearStartGameCountdown();
        clearTeamShuffleAnimation();
    }
    
    // Hide modal if showing a new screen
    if (screenId !== 'game-progress') {
        hideModal();
    }
}

function clearTeamSelectionCountdown() {
    if (teamSelectionCountdownInterval !== null) {
        clearInterval(teamSelectionCountdownInterval);
        teamSelectionCountdownInterval = null;
    }
}

function clearStartGameCountdown() {
    if (startGameCountdownInterval !== null) {
        clearInterval(startGameCountdownInterval);
        startGameCountdownInterval = null;
    }
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.textContent = 'Start Game';
    }
}

function startStartGameCountdown() {
    const viewingFromGame = AppState.viewingTeamsFromGame && AppState.currentGame;
    if (viewingFromGame) {
        clearStartGameCountdown();
        return;
    }

    const startGameBtn = document.getElementById('start-game-btn');
    if (!startGameBtn || startGameBtn.style.display === 'none') {
        clearStartGameCountdown();
        return;
    }

    clearStartGameCountdown();

    let seconds = 60;
    startGameBtn.textContent = `Start Game (${seconds})`;

    startGameCountdownInterval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            clearStartGameCountdown();
            if (AppState.currentScreen === 'team-selection') {
                startGame();
            }
            return;
        }
        if (!document.body.contains(startGameBtn)) {
            clearStartGameCountdown();
            return;
        }
        startGameBtn.textContent = `Start Game (${seconds})`;
    }, 1000);
}

function restartStartGameCountdownIfNeeded() {
    const viewingFromGame = AppState.viewingTeamsFromGame && AppState.currentGame;
    if (AppState.currentScreen === 'team-selection' && !viewingFromGame) {
        startStartGameCountdown();
    }
}

function updateTeamSelectionFooter() {
    clearTeamSelectionCountdown();
    clearStartGameCountdown();
    const backToGameBtn = document.getElementById('back-to-game-btn');
    const backToEntriesBtn = document.getElementById('back-to-entries-btn');
    const rematchBtn = document.getElementById('rematch-btn');
    const editTeamsBtn = document.getElementById('edit-teams-btn');
    const swapSidesBtn = document.getElementById('swap-sides-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    
    const viewingFromGame = AppState.viewingTeamsFromGame && AppState.currentGame;
    
    if (backToGameBtn) backToGameBtn.style.display = viewingFromGame ? '' : 'none';
    if (backToEntriesBtn) backToEntriesBtn.style.display = viewingFromGame ? 'none' : '';
    if (rematchBtn) rematchBtn.style.display = viewingFromGame ? 'none' : (AppState.previousTeams ? 'block' : 'none');
    if (editTeamsBtn) editTeamsBtn.style.display = viewingFromGame ? 'none' : '';
    if (swapSidesBtn) swapSidesBtn.style.display = viewingFromGame ? 'none' : '';
    const finishSessionTeamSelectionBtn = document.getElementById('finish-session-team-selection-btn');
    if (finishSessionTeamSelectionBtn) finishSessionTeamSelectionBtn.style.display = viewingFromGame ? 'none' : '';
    if (startGameBtn) startGameBtn.style.display = viewingFromGame ? 'none' : '';

    const addPlayerDuringGameBtn = document.getElementById('add-player-during-game-toggle-btn');
    if (addPlayerDuringGameBtn) {
        addPlayerDuringGameBtn.style.display = viewingFromGame ? '' : 'none';
        addPlayerDuringGameBtn.textContent = AppState.teamAddPlayerMode ? 'Done' : 'Add Player';
    }
    const removePlayerDuringGameBtn = document.getElementById('remove-player-during-game-toggle-btn');
    if (removePlayerDuringGameBtn) {
        removePlayerDuringGameBtn.style.display = viewingFromGame ? '' : 'none';
        removePlayerDuringGameBtn.textContent = AppState.teamRemovePlayerMode ? 'Done' : 'Remove Player';
    }
    
    if (viewingFromGame && backToGameBtn) {
        AppState.teamEditMode = false;
        if (AppState.currentTeams) renderTeamDisplay(AppState.currentTeams);
        let seconds = 30;
        backToGameBtn.textContent = `Back to Game (${seconds})`;
        teamSelectionCountdownInterval = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearTeamSelectionCountdown();
                AppState.viewingTeamsFromGame = false;
                AppState.teamAddPlayerMode = false;
                AppState.teamRemovePlayerMode = false;
                showScreen('game-progress');
                return;
            }
            backToGameBtn.textContent = `Back to Game (${seconds})`;
        }, 1000);
    } else if (AppState.teamShuffleAnimating) {
        setTeamSelectionControlsEnabled(false);
    } else {
        AppState.teamAddPlayerMode = false;
        AppState.teamRemovePlayerMode = false;
        if (addPlayerDuringGameBtn) addPlayerDuringGameBtn.style.display = 'none';
        if (removePlayerDuringGameBtn) removePlayerDuringGameBtn.style.display = 'none';
        startStartGameCountdown();
    }
}

function showModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        modal.classList.add('active');
    }
}

function hideModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    // Reset goal registration state
    AppState.goalRegistration = { team: null, scorer: null, assist: null };
}

// Player Management
function addPlayer(name) {
    if (!name || name.trim() === '') return false;
    if (AppState.players.length >= 20) {
        alert('Maximum 20 players allowed');
        return false;
    }
    
    const player = {
        id: Date.now().toString(),
        name: name.trim(),
        gamesWon: 0,
        gamesPlayed: 0,
        points: 0,
        goals: 0,
        assists: 0,
        hattricks: 0,
        pointsInWins: 0,
        decisiveGoals: 0,
        decisiveAssists: 0,
        plusMinus: 0,
        active: true
    };
    
    AppState.players.unshift(player);
    saveSession();
    renderPlayerEntries();
    return true;
}

function addGoalkeeper(name) {
    if (!name || name.trim() === '') return false;
    const trimmed = name.trim();
    const goalkeeper = {
        id: `gk-${Date.now().toString()}`,
        name: trimmed,
        gamesAsGK: 0,
        goalsConceded: 0,
        cleanSheets: 0,
        winsAsGK: 0
    };
    AppState.goalkeepers.push(goalkeeper);
    saveSession();
    renderSettings();
    return true;
}

function removeGoalkeeper(id) {
    if (!id) return;
    AppState.goalkeepers = AppState.goalkeepers.filter(gk => gk.id !== id);
    saveSession();
    renderSettings();
}

function removePlayer(id) {
    const player = AppState.players.find(p => p.id === id);
    if (!player) return;
    if (player.gamesPlayed === 0) {
        // Remove entirely from session and standings
        AppState.players = AppState.players.filter(p => p.id !== id);
    } else {
        // Mark as inactive (keeps stats but removes from team selection)
        player.active = false;
    }
    saveSession();
    renderPlayerEntries();
    updateStandings();
}

function getActivePlayers() {
    // Return only active players for team selection
    // Handle backwards compatibility: if active property doesn't exist, assume active
    return AppState.players.filter(p => p.active !== false);
}

function isPlusMinusFairConfig() {
    // Fair config: starting lineup enabled, 3–5 players per side, and exactly 2N active players
    if (!AppState.settings || !AppState.settings.startingLineupEnabled) return false;
    const N = AppState.settings.startingLineupCount || 0;
    if (N < 3 || N > 5) return false;
    const activePlayers = getActivePlayers();
    return activePlayers.length === 2 * N;
}

function isPlusMinusActiveForSession() {
    const games = AppState.gameHistory || [];
    return games.some(game => game && game.plusMinusEnabled);
}

// Team Randomization
const MAX_SHUFFLE_ATTEMPTS = 50;
const TARGET_CANDIDATES = 12;

function randomizeTeams() {
    const activePlayers = getActivePlayers();
    if (activePlayers.length < 2) return null;

    const seenSignatures = new Set();
    const candidates = [];

    const teamHistory = AppState.teamHistory || [];
    const previousTeamsValid = !!(
        AppState.previousTeams &&
        Array.isArray(AppState.previousTeams.blackTeam) &&
        Array.isArray(AppState.previousTeams.whiteTeam)
    );

    const targetSwitchPerDirection = (() => {
        const n = activePlayers.length;
        if (n >= 8 && n <= 11) return 2;
        if (n >= 12) return 3;
        return null;
    })();

    const canTargetMixing =
        previousTeamsValid && targetSwitchPerDirection !== null;

    const prevBlackIds = canTargetMixing
        ? new Set(AppState.previousTeams.blackTeam.map(p => p.id))
        : null;
    const prevWhiteIds = canTargetMixing
        ? new Set(AppState.previousTeams.whiteTeam.map(p => p.id))
        : null;

    // Prefer targeted mixing when possible; otherwise fall back to current heuristic.
    for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt++) {
        const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
        const mid = Math.ceil(shuffled.length / 2);
        const blackTeam = shuffled.slice(0, mid);
        const whiteTeam = shuffled.slice(mid);
        const teamSignature = createTeamSignature(blackTeam, whiteTeam);

        // Keep candidate set bounded and avoid duplicate signatures.
        if (seenSignatures.has(teamSignature)) continue;
        seenSignatures.add(teamSignature);

        if (canTargetMixing) {
            let switchedToBlack = 0;
            for (const p of blackTeam) {
                if (prevWhiteIds.has(p.id)) switchedToBlack++;
            }

            let switchedToWhite = 0;
            for (const p of whiteTeam) {
                if (prevBlackIds.has(p.id)) switchedToWhite++;
            }

            const penalty =
                Math.abs(switchedToBlack - targetSwitchPerDirection) +
                Math.abs(switchedToWhite - targetSwitchPerDirection);

            const totalSwitches = switchedToBlack + switchedToWhite;

            const candidate = {
                blackTeam,
                whiteTeam,
                teamSignature,
                switchedToBlack,
                switchedToWhite,
                totalSwitches,
                penalty
            };

            // Early exit: exact target match and not forbidden by teamHistory.
            if (penalty === 0 && !teamHistory.includes(teamSignature)) {
                AppState.teamHistory.push(teamSignature);
                if (AppState.teamHistory.length > 10) {
                    AppState.teamHistory = [];
                }
                return { blackTeam: candidate.blackTeam, whiteTeam: candidate.whiteTeam };
            }

            candidates.push(candidate);
        } else {
            const variationScore = getVariationScore(blackTeam, whiteTeam);
            candidates.push({ blackTeam, whiteTeam, teamSignature, variationScore });
        }

        if (seenSignatures.size >= TARGET_CANDIDATES) break;
    }

    if (canTargetMixing) {
        const newLineups = candidates.filter(c => !teamHistory.includes(c.teamSignature));
        const repeatLineups = candidates.filter(c => teamHistory.includes(c.teamSignature));
        const pool = newLineups.length > 0 ? newLineups : repeatLineups;

        // Choose the candidate with the smallest penalty.
        // Tie-break: prefer higher total switch count (feels more "mixed").
        let bestPenalty = Infinity;
        let bestTotalSwitches = -Infinity;
        let bestCandidates = [];

        for (const c of pool) {
            if (c.penalty < bestPenalty) {
                bestPenalty = c.penalty;
                bestTotalSwitches = c.totalSwitches;
                bestCandidates = [c];
            } else if (c.penalty === bestPenalty) {
                if (c.totalSwitches > bestTotalSwitches) {
                    bestTotalSwitches = c.totalSwitches;
                    bestCandidates = [c];
                } else if (c.totalSwitches === bestTotalSwitches) {
                    bestCandidates.push(c);
                }
            }
        }

        const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];

        AppState.teamHistory.push(chosen.teamSignature);
        if (AppState.teamHistory.length > 10) {
            AppState.teamHistory = [];
        }

        return { blackTeam: chosen.blackTeam, whiteTeam: chosen.whiteTeam };
    } else {
        const newLineups = candidates.filter(c => !teamHistory.includes(c.teamSignature));
        const repeatLineups = candidates.filter(c => teamHistory.includes(c.teamSignature));
        const pool = newLineups.length > 0 ? newLineups : repeatLineups;

        const maxScore = Math.max(...pool.map(c => c.variationScore));
        const bestCandidates = pool.filter(c => c.variationScore === maxScore);
        const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];

        AppState.teamHistory.push(chosen.teamSignature);
        if (AppState.teamHistory.length > 10) {
            AppState.teamHistory = [];
        }

        return { blackTeam: chosen.blackTeam, whiteTeam: chosen.whiteTeam };
    }
}

function createTeamSignature(blackTeam, whiteTeam) {
    // Canonical signature: same for (black=A, white=B) and (black=B, white=A)
    const blackIds = blackTeam.map(p => p.id).sort().join(',');
    const whiteIds = whiteTeam.map(p => p.id).sort().join(',');
    const [first, second] = [blackIds, whiteIds].sort();
    return `${first}|${second}`;
}

function getVariationScore(blackTeam, whiteTeam) {
    if (!AppState.previousTeams) return 0;
    const prevBlackIds = new Set(AppState.previousTeams.blackTeam.map(p => p.id));
    const prevWhiteIds = new Set(AppState.previousTeams.whiteTeam.map(p => p.id));
    const currBlackIds = new Set(blackTeam.map(p => p.id));
    let switched = 0;
    for (const p of blackTeam) {
        if (prevWhiteIds.has(p.id)) switched++;
    }
    for (const p of whiteTeam) {
        if (prevBlackIds.has(p.id)) switched++;
    }
    return switched;
}

function pickRandomStarters(teams) {
    const N = AppState.settings.startingLineupCount;
    const pick = (team) => {
        const count = Math.min(N, team.length);
        return team.slice(0, count).map(p => p.id);
    };
    return {
        blackTeam: pick(teams.blackTeam),
        whiteTeam: pick(teams.whiteTeam)
    };
}

// Game Management
function startGame() {
    // Use the teams that were displayed on Team Selection screen
    if (!AppState.currentTeams) {
        // Fallback: randomize if somehow teams weren't set
        AppState.currentTeams = randomizeTeams();
    }
    
    if (!AppState.currentTeams) {
        alert('Need at least 2 players to start a game');
        return;
    }
    
    // Reset edit mode when starting a game
    AppState.teamEditMode = false;
    
    const gameNumber = AppState.gameHistory.length + 1;
    const plusMinusEnabled = isPlusMinusFairConfig();
    AppState.currentGame = {
        gameNumber: gameNumber,
        blackTeam: AppState.currentTeams.blackTeam,
        whiteTeam: AppState.currentTeams.whiteTeam,
        blackGKId: AppState.currentTeams.blackGKId || null,
        whiteGKId: AppState.currentTeams.whiteGKId || null,
        blackScore: 0,
        whiteScore: 0,
        goals: [],
        playerGoals: {}, // Track goals per player in this game for hattricks
        playerPoints: {}, // Track points per player in this game for MVP calculation
        plusMinusEnabled: plusMinusEnabled,
        lateJoinerIds: [], // Players added after their own team scored its first goal — no win credit
        removedPlayers: [], // { id, team, winCredit, leftAtGoalCount } — mid-game leavers
        playerJoinedAtGoalCount: {}, // playerId -> goal index when they joined the team
        playerLeftAtGoalCount: {} // playerId -> goal index when they left the team
    };

    [...AppState.currentTeams.blackTeam, ...AppState.currentTeams.whiteTeam].forEach(player => {
        AppState.currentGame.playerJoinedAtGoalCount[player.id] = 0;
    });
    
    AppState.sessionActive = true;
    saveSession();
    renderGameProgress();
    showScreen('game-progress');
}

function registerGoal(team, scorer, assist) {
    if (!AppState.currentGame) return;
    
    // Check max score limit if enabled
    // Disable goal registration if either team has reached max score
    if (AppState.settings.maxScoreEnabled) {
        const maxScoreReached = AppState.currentGame.blackScore >= AppState.settings.maxScore || 
                                AppState.currentGame.whiteScore >= AppState.settings.maxScore;
        if (maxScoreReached) {
            alert(`Maximum score (${AppState.settings.maxScore}) has been reached. Use END GAME to finish.`);
            return;
        }
    }
    
    // Update score
    if (team === 'black') {
        AppState.currentGame.blackScore++;
    } else {
        AppState.currentGame.whiteScore++;
    }
    
    // Record goal (ensure assist is null if assists are disabled)
    const goal = {
        team: team,
        scorer: scorer,
        assist: AppState.settings.assistsEnabled ? assist : null,
        timestamp: Date.now()
    };
    
    AppState.currentGame.goals.push(goal);
    
    // Track goals per player for hattrick detection (scorer is always valid, never NONE)
    const playerId = scorer;
    if (!AppState.currentGame.playerGoals[playerId]) {
        AppState.currentGame.playerGoals[playerId] = 0;
    }
    AppState.currentGame.playerGoals[playerId]++;
    
    // Check for hattrick (3rd goal)
    if (AppState.currentGame.playerGoals[playerId] === 3) {
        const player = AppState.players.find(p => p.id === playerId);
        if (player) {
            player.hattricks++;
        }
    }
    
    // Update player stats (will be finalized when game ends)
    const scorerPlayer = AppState.players.find(p => p.id === scorer);
    if (scorerPlayer) {
        scorerPlayer.goals++;
        scorerPlayer.points++;
        // Track points per game for MVP calculation
        if (!AppState.currentGame.playerPoints[scorer]) {
            AppState.currentGame.playerPoints[scorer] = 0;
        }
        AppState.currentGame.playerPoints[scorer]++;
    }
    
    // Only process assist if assists are enabled
    if (AppState.settings.assistsEnabled && assist && assist !== 'NONE') {
        const assistPlayer = AppState.players.find(p => p.id === assist);
        if (assistPlayer) {
            assistPlayer.assists++;
            assistPlayer.points++;
            // Track points per game for MVP calculation
            if (!AppState.currentGame.playerPoints[assist]) {
                AppState.currentGame.playerPoints[assist] = 0;
            }
            AppState.currentGame.playerPoints[assist]++;
        }
    }
    
    // Update plus/minus if enabled for this game
    if (AppState.currentGame.plusMinusEnabled) {
        const goalIndex = AppState.currentGame.goals.length - 1;
        const scoringTeam = getTeamPlayersForPlusMinus(AppState.currentGame, team, goalIndex);
        const concedingTeam = getTeamPlayersForPlusMinus(
            AppState.currentGame,
            team === 'black' ? 'white' : 'black',
            goalIndex
        );
        
        scoringTeam.forEach(playerObj => {
            const p = AppState.players.find(pl => pl.id === playerObj.id);
            if (p && typeof p.plusMinus === 'number') {
                p.plusMinus += 1;
            }
        });
        
        concedingTeam.forEach(playerObj => {
            const p = AppState.players.find(pl => pl.id === playerObj.id);
            if (p && typeof p.plusMinus === 'number') {
                p.plusMinus -= 1;
            }
        });
    }
    
    saveSession();
    renderGameProgress();
    hideModal();
}

function undoLastGoal() {
    if (!AppState.currentGame || !AppState.currentGame.goals.length) return;
    
    const goal = AppState.currentGame.goals.pop();
    const { team, scorer, assist } = goal;
    
    // Revert score
    if (team === 'black') {
        AppState.currentGame.blackScore--;
    } else {
        AppState.currentGame.whiteScore--;
    }
    
    // Revert per-game player goals (for hattrick tracking)
    if (AppState.currentGame.playerGoals[scorer]) {
        const wasThird = AppState.currentGame.playerGoals[scorer] === 3;
        AppState.currentGame.playerGoals[scorer]--;
        if (AppState.currentGame.playerGoals[scorer] === 0) {
            delete AppState.currentGame.playerGoals[scorer];
        }
        if (wasThird) {
            const player = AppState.players.find(p => p.id === scorer);
            if (player && player.hattricks > 0) player.hattricks--;
        }
    }
    
    // Revert global player stats (scorer)
    const scorerPlayer = AppState.players.find(p => p.id === scorer);
    if (scorerPlayer) {
        if (scorerPlayer.goals > 0) scorerPlayer.goals--;
        if (scorerPlayer.points > 0) scorerPlayer.points--;
    }
    if (AppState.currentGame.playerPoints[scorer]) {
        AppState.currentGame.playerPoints[scorer]--;
        if (AppState.currentGame.playerPoints[scorer] === 0) {
            delete AppState.currentGame.playerPoints[scorer];
        }
    }
    
    // Revert assist if present
    if (AppState.settings.assistsEnabled && assist && assist !== 'NONE') {
        const assistPlayer = AppState.players.find(p => p.id === assist);
        if (assistPlayer) {
            if (assistPlayer.assists > 0) assistPlayer.assists--;
            if (assistPlayer.points > 0) assistPlayer.points--;
        }
        if (AppState.currentGame.playerPoints[assist]) {
            AppState.currentGame.playerPoints[assist]--;
            if (AppState.currentGame.playerPoints[assist] === 0) {
                delete AppState.currentGame.playerPoints[assist];
            }
        }
    }
    
    // Revert plus/minus if enabled for this game
    if (AppState.currentGame.plusMinusEnabled) {
        const goalIndex = AppState.currentGame.goals.length;
        const scoringTeam = getTeamPlayersForPlusMinus(AppState.currentGame, team, goalIndex);
        const concedingTeam = getTeamPlayersForPlusMinus(
            AppState.currentGame,
            team === 'black' ? 'white' : 'black',
            goalIndex
        );
        
        scoringTeam.forEach(playerObj => {
            const p = AppState.players.find(pl => pl.id === playerObj.id);
            if (p && typeof p.plusMinus === 'number') {
                p.plusMinus -= 1;
            }
        });
        
        concedingTeam.forEach(playerObj => {
            const p = AppState.players.find(pl => pl.id === playerObj.id);
            if (p && typeof p.plusMinus === 'number') {
                p.plusMinus += 1;
            }
        });
    }
    
    saveSession();
    renderGameProgress();
}

function calculateDecisiveGoal(game) {
    if (!game || !game.goals || game.goals.length === 0) {
        return null;
    }
    
    const finalBlackScore = game.blackScore;
    const finalWhiteScore = game.whiteScore;
    
    // If game ends in a tie, no decisive goal
    if (finalBlackScore === finalWhiteScore) {
        return null;
    }
    
    const winner = finalBlackScore > finalWhiteScore ? 'black' : 'white';
    const winnerScore = winner === 'black' ? finalBlackScore : finalWhiteScore;
    const loserScore = winner === 'black' ? finalWhiteScore : finalBlackScore;
    
    // Case 1 (max score only): Last goal breaks tie at maxScore-1
    if (AppState.settings.maxScoreEnabled) {
        const maxScore = AppState.settings.maxScore;
        if (winnerScore === maxScore && loserScore === maxScore - 1) {
            return game.goals.length - 1;
        }
    }
    
    // Case 2: First goal creating 2-goal lead that's never caught (always applied)
    let blackScore = 0;
    let whiteScore = 0;
    
    for (let i = 0; i < game.goals.length; i++) {
        const goal = game.goals[i];
        
        // Update running scores
        if (goal.team === 'black') {
            blackScore++;
        } else {
            whiteScore++;
        }
        
        // Check if this goal creates a 2-goal lead for the eventual winner
        const scoreDiff = Math.abs(blackScore - whiteScore);
        const leadingTeam = blackScore > whiteScore ? 'black' : 'white';
        
        if (scoreDiff >= 2 && leadingTeam === winner) {
            // This goal creates a 2-goal lead for the winning team
            // Verify that the losing team never catches up (ties or takes the lead) in subsequent goals
            let futureBlackScore = blackScore;
            let futureWhiteScore = whiteScore;
            let leadMaintained = true;
            
            for (let j = i + 1; j < game.goals.length; j++) {
                const futureGoal = game.goals[j];
                if (futureGoal.team === 'black') {
                    futureBlackScore++;
                } else {
                    futureWhiteScore++;
                }
                
                // Check if losing team catches up (ties or takes the lead)
                const futureWinnerScore = winner === 'black' ? futureBlackScore : futureWhiteScore;
                const futureLoserScore = winner === 'black' ? futureWhiteScore : futureBlackScore;
                
                // If losing team ties or takes the lead, the lead wasn't maintained
                if (futureLoserScore >= futureWinnerScore) {
                    leadMaintained = false;
                    break;
                }
            }
            
            if (leadMaintained) {
                return i; // This is the decisive goal
            }
        }
    }
    
    // No decisive goal found
    return null;
}

function endGame() {
    if (!AppState.currentGame) return;
    
    // Determine winner and update games won
    const blackScore = AppState.currentGame.blackScore;
    const whiteScore = AppState.currentGame.whiteScore;
    
    let winningTeam = null;
    const lateJoinerIds = new Set(AppState.currentGame.lateJoinerIds || []);
    const removedPlayers = Array.isArray(AppState.currentGame.removedPlayers)
        ? AppState.currentGame.removedPlayers
        : [];

    if (blackScore > whiteScore) {
        // Black team wins
        winningTeam = 'black';
        AppState.currentGame.blackTeam.forEach(player => {
            const p = AppState.players.find(pl => pl.id === player.id);
            if (p && !lateJoinerIds.has(player.id)) p.gamesWon++;
        });
    } else if (whiteScore > blackScore) {
        // White team wins
        winningTeam = 'white';
        AppState.currentGame.whiteTeam.forEach(player => {
            const p = AppState.players.find(pl => pl.id === player.id);
            if (p && !lateJoinerIds.has(player.id)) p.gamesWon++;
        });
    }
    // If tie, no one gets a win

    // Mid-game leavers: win credit if they stayed through own team's 2nd goal (and weren't late joiners)
    if (winningTeam) {
        removedPlayers.forEach(rp => {
            if (rp.team !== winningTeam || !rp.winCredit || lateJoinerIds.has(rp.id)) return;
            const p = AppState.players.find(pl => pl.id === rp.id);
            if (p) p.gamesWon++;
        });
    }
    
    // Increment games played for all players still on a team at end of game
    AppState.currentGame.blackTeam.forEach(player => {
        const p = AppState.players.find(pl => pl.id === player.id);
        if (p) p.gamesPlayed++;
    });
    AppState.currentGame.whiteTeam.forEach(player => {
        const p = AppState.players.find(pl => pl.id === player.id);
        if (p) p.gamesPlayed++;
    });
    
    // Track points in wins for MVP calculation (roster + eligible leavers)
    if (winningTeam) {
        const winningTeamPlayers = winningTeam === 'black' 
            ? AppState.currentGame.blackTeam 
            : AppState.currentGame.whiteTeam;
        
        winningTeamPlayers.forEach(player => {
            const p = AppState.players.find(pl => pl.id === player.id);
            if (p && AppState.currentGame.playerPoints[player.id]) {
                p.pointsInWins += AppState.currentGame.playerPoints[player.id];
            }
        });

        removedPlayers.forEach(rp => {
            if (rp.team !== winningTeam || !rp.winCredit || lateJoinerIds.has(rp.id)) return;
            const pts = AppState.currentGame.playerPoints[rp.id] || 0;
            if (pts <= 0) return;
            const p = AppState.players.find(pl => pl.id === rp.id);
            if (p) p.pointsInWins += pts;
        });
    }

    // Update goalkeeper stats (dedicated GKs only)
    if (AppState.settings.goalkeepersEnabled) {
        const blackGKId = AppState.currentGame.blackGKId || null;
        const whiteGKId = AppState.currentGame.whiteGKId || null;

        if (blackGKId) {
            const gk = AppState.goalkeepers.find(g => g.id === blackGKId);
            if (gk) {
                gk.gamesAsGK = (gk.gamesAsGK || 0) + 1;
                gk.goalsConceded = (gk.goalsConceded || 0) + (whiteScore || 0);
                if (whiteScore === 0) {
                    gk.cleanSheets = (gk.cleanSheets || 0) + 1;
                }
                if (winningTeam === 'black') {
                    gk.winsAsGK = (gk.winsAsGK || 0) + 1;
                }
            }
        }

        if (whiteGKId) {
            const gk = AppState.goalkeepers.find(g => g.id === whiteGKId);
            if (gk) {
                gk.gamesAsGK = (gk.gamesAsGK || 0) + 1;
                gk.goalsConceded = (gk.goalsConceded || 0) + (blackScore || 0);
                if (blackScore === 0) {
                    gk.cleanSheets = (gk.cleanSheets || 0) + 1;
                }
                if (winningTeam === 'white') {
                    gk.winsAsGK = (gk.winsAsGK || 0) + 1;
                }
            }
        }
    }
    
    // Calculate decisive goal (always on: Case 2 when max score off, Case 1+2 when on)
    AppState.currentGame.decisiveGoalIndex = calculateDecisiveGoal(AppState.currentGame);
    
    if (AppState.currentGame.decisiveGoalIndex !== null && AppState.currentGame.decisiveGoalIndex !== undefined) {
        const decisiveGoal = AppState.currentGame.goals[AppState.currentGame.decisiveGoalIndex];
        if (decisiveGoal && decisiveGoal.scorer) {
            const decisiveScorer = AppState.players.find(p => p.id === decisiveGoal.scorer);
            if (decisiveScorer) {
                decisiveScorer.decisiveGoals++;
            }
            if (decisiveGoal.assist && decisiveGoal.assist !== 'NONE') {
                const decisiveAssister = AppState.players.find(p => p.id === decisiveGoal.assist);
                if (decisiveAssister) {
                    decisiveAssister.decisiveAssists++;
                }
            }
        }
    }
    
    // Save game to history
    AppState.gameHistory.push({ ...AppState.currentGame });
    
    saveSession();
    updateStandings();
    renderGameSummary();
    showScreen('game-summary');
}

function resetAllStatsFromHistory() {
    const players = AppState.players || [];
    const goalkeepers = AppState.goalkeepers || [];
    const games = AppState.gameHistory || [];

    // Reset player stats
    players.forEach(player => {
        player.gamesWon = 0;
        player.gamesPlayed = 0;
        player.points = 0;
        player.goals = 0;
        player.assists = 0;
        player.hattricks = 0;
        player.pointsInWins = 0;
        player.decisiveGoals = 0;
        player.decisiveAssists = 0;
        player.plusMinus = 0;
    });

    // Reset goalkeeper stats
    goalkeepers.forEach(gk => {
        gk.gamesAsGK = 0;
        gk.goalsConceded = 0;
        gk.cleanSheets = 0;
        gk.winsAsGK = 0;
    });

    // Rebuild stats by replaying all games in chronological order
    games.forEach((game, index) => {
        if (!game) return;

        game.gameNumber = index + 1;
        game.playerGoals = {};
        game.playerPoints = {};

        let blackScore = 0;
        let whiteScore = 0;

        const goals = Array.isArray(game.goals) ? game.goals : [];
        const plusMinusEnabled = !!game.plusMinusEnabled;

        goals.forEach((goal, goalIndex) => {
            if (!goal || !goal.scorer || (goal.team !== 'black' && goal.team !== 'white')) {
                return;
            }

            if (goal.team === 'black') {
                blackScore++;
            } else {
                whiteScore++;
            }

            const scorerId = goal.scorer;
            if (!game.playerGoals[scorerId]) {
                game.playerGoals[scorerId] = 0;
            }
            game.playerGoals[scorerId]++;

            const scorerPlayer = players.find(p => p.id === scorerId);
            if (scorerPlayer) {
                scorerPlayer.goals = (scorerPlayer.goals || 0) + 1;
                scorerPlayer.points = (scorerPlayer.points || 0) + 1;
                if (!game.playerPoints[scorerId]) {
                    game.playerPoints[scorerId] = 0;
                }
                game.playerPoints[scorerId]++;
            }

            const assistId = goal.assist;
            if (assistId && assistId !== 'NONE') {
                const assistPlayer = players.find(p => p.id === assistId);
                if (assistPlayer) {
                    assistPlayer.assists = (assistPlayer.assists || 0) + 1;
                    assistPlayer.points = (assistPlayer.points || 0) + 1;
                    if (!game.playerPoints[assistId]) {
                        game.playerPoints[assistId] = 0;
                    }
                    game.playerPoints[assistId]++;
                }
            }
            
            // Apply plus/minus for this goal if enabled on this game
            if (plusMinusEnabled) {
                const scoringTeam = getTeamPlayersForPlusMinus(game, goal.team, goalIndex);
                const concedingTeam = getTeamPlayersForPlusMinus(
                    game,
                    goal.team === 'black' ? 'white' : 'black',
                    goalIndex
                );
                
                scoringTeam.forEach(playerObj => {
                    const p = players.find(pl => pl.id === playerObj.id);
                    if (p) {
                        p.plusMinus = (p.plusMinus || 0) + 1;
                    }
                });
                
                concedingTeam.forEach(playerObj => {
                    const p = players.find(pl => pl.id === playerObj.id);
                    if (p) {
                        p.plusMinus = (p.plusMinus || 0) - 1;
                    }
                });
            }
        });

        // Hattricks: one per game per player if they scored at least 3
        Object.keys(game.playerGoals).forEach(playerId => {
            const count = game.playerGoals[playerId];
            if (count >= 3) {
                const player = players.find(p => p.id === playerId);
                if (player) {
                    player.hattricks = (player.hattricks || 0) + 1;
                }
            }
        });

        game.blackScore = blackScore;
        game.whiteScore = whiteScore;

        const blackTeam = Array.isArray(game.blackTeam) ? game.blackTeam : [];
        const whiteTeam = Array.isArray(game.whiteTeam) ? game.whiteTeam : [];

        blackTeam.forEach(playerObj => {
            const p = players.find(pl => pl.id === playerObj.id);
            if (p) {
                p.gamesPlayed = (p.gamesPlayed || 0) + 1;
            }
        });

        whiteTeam.forEach(playerObj => {
            const p = players.find(pl => pl.id === playerObj.id);
            if (p) {
                p.gamesPlayed = (p.gamesPlayed || 0) + 1;
            }
        });

        let winningTeam = null;
        if (blackScore > whiteScore) {
            winningTeam = 'black';
        } else if (whiteScore > blackScore) {
            winningTeam = 'white';
        }

        const lateJoinerIds = new Set(game.lateJoinerIds || []);
        const removedPlayers = Array.isArray(game.removedPlayers) ? game.removedPlayers : [];

        if (winningTeam === 'black') {
            blackTeam.forEach(playerObj => {
                const p = players.find(pl => pl.id === playerObj.id);
                if (p && !lateJoinerIds.has(playerObj.id)) {
                    p.gamesWon = (p.gamesWon || 0) + 1;
                }
            });
        } else if (winningTeam === 'white') {
            whiteTeam.forEach(playerObj => {
                const p = players.find(pl => pl.id === playerObj.id);
                if (p && !lateJoinerIds.has(playerObj.id)) {
                    p.gamesWon = (p.gamesWon || 0) + 1;
                }
            });
        }

        if (winningTeam) {
            removedPlayers.forEach(rp => {
                if (rp.team !== winningTeam || !rp.winCredit || lateJoinerIds.has(rp.id)) return;
                const p = players.find(pl => pl.id === rp.id);
                if (p) {
                    p.gamesWon = (p.gamesWon || 0) + 1;
                }
            });
        }

        if (winningTeam) {
            const winningTeamPlayers = winningTeam === 'black' ? blackTeam : whiteTeam;
            winningTeamPlayers.forEach(playerObj => {
                const pid = playerObj.id;
                const p = players.find(pl => pl.id === pid);
                const ptsInGame = game.playerPoints[pid] || 0;
                if (p && ptsInGame > 0) {
                    p.pointsInWins = (p.pointsInWins || 0) + ptsInGame;
                }
            });

            removedPlayers.forEach(rp => {
                if (rp.team !== winningTeam || !rp.winCredit || lateJoinerIds.has(rp.id)) return;
                const ptsInGame = game.playerPoints[rp.id] || 0;
                if (ptsInGame <= 0) return;
                const p = players.find(pl => pl.id === rp.id);
                if (p) {
                    p.pointsInWins = (p.pointsInWins || 0) + ptsInGame;
                }
            });
        }

        // Goalkeeper stats: based on presence of GK ids in the stored game
        const blackGKId = game.blackGKId || null;
        const whiteGKId = game.whiteGKId || null;

        if (blackGKId) {
            const gk = goalkeepers.find(g => g.id === blackGKId);
            if (gk) {
                gk.gamesAsGK = (gk.gamesAsGK || 0) + 1;
                gk.goalsConceded = (gk.goalsConceded || 0) + (whiteScore || 0);
                if (whiteScore === 0) {
                    gk.cleanSheets = (gk.cleanSheets || 0) + 1;
                }
                if (winningTeam === 'black') {
                    gk.winsAsGK = (gk.winsAsGK || 0) + 1;
                }
            }
        }

        if (whiteGKId) {
            const gk = goalkeepers.find(g => g.id === whiteGKId);
            if (gk) {
                gk.gamesAsGK = (gk.gamesAsGK || 0) + 1;
                gk.goalsConceded = (gk.goalsConceded || 0) + (blackScore || 0);
                if (blackScore === 0) {
                    gk.cleanSheets = (gk.cleanSheets || 0) + 1;
                }
                if (winningTeam === 'white') {
                    gk.winsAsGK = (gk.winsAsGK || 0) + 1;
                }
            }
        }

        // Decisive goal index and related stats
        game.decisiveGoalIndex = calculateDecisiveGoal(game);
        if (game.decisiveGoalIndex !== null && game.decisiveGoalIndex !== undefined) {
            const decisiveGoal = goals[game.decisiveGoalIndex];
            if (decisiveGoal && decisiveGoal.scorer) {
                const decisiveScorer = players.find(p => p.id === decisiveGoal.scorer);
                if (decisiveScorer) {
                    decisiveScorer.decisiveGoals = (decisiveScorer.decisiveGoals || 0) + 1;
                }
                if (decisiveGoal.assist && decisiveGoal.assist !== 'NONE') {
                    const decisiveAssister = players.find(p => p.id === decisiveGoal.assist);
                    if (decisiveAssister) {
                        decisiveAssister.decisiveAssists = (decisiveAssister.decisiveAssists || 0) + 1;
                    }
                }
            }
        }
    });
}

function finishSession() {
    AppState.sessionActive = false;
    AppState.todaysStatsView = 'field';
    saveSession();
    renderTodaysStats();
    showScreen('todays-stats');
}

function continueSession() {
    // Check if there are active players
    const activePlayers = getActivePlayers();
    
    if (activePlayers.length >= 2) {
        // Re-enable session and go to Team Selection
        AppState.sessionActive = true;
        saveSession();
        renderTeamSelection();
        showScreen('team-selection');
    } else {
        // Not enough players, go to Player Entries
        showScreen('player-entries');
    }
}

function resetAllData() {
    // Show confirmation dialog
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
        // Reset all session data (including team names)
        resetSession();
        renderSettings();
        applyTeamColors();
        
        // Clear standings display
        const standingsBody = document.getElementById('standings-body');
        if (standingsBody) {
            standingsBody.innerHTML = '';
        }
        
        const fullStandingsBody = document.getElementById('full-standings-body');
        if (fullStandingsBody) {
            fullStandingsBody.innerHTML = '';
        }
        
        // Navigate to Player Entries screen
        renderPlayerEntries();
        showScreen('player-entries');
    }
}

// Ranking Algorithm
function sortPlayers(a, b) {
    // Sort by: Games Won → Points → Goals (all descending)
    if (a.gamesWon !== b.gamesWon) {
        return b.gamesWon - a.gamesWon;
    }
    if (a.points !== b.points) {
        return b.points - a.points;
    }
    return b.goals - a.goals;
}

function updateStandings() {
    const tbody = document.getElementById('standings-body');
    if (!tbody) return;
    
    // Sort players
    const sortedPlayers = [...AppState.players].sort(sortPlayers);
    const plusMinusActive = isPlusMinusActiveForSession();
    
    tbody.innerHTML = '';
    
    sortedPlayers.forEach(player => {
        const row = document.createElement('tr');
        const plusMinusCell = plusMinusActive ? `<td>${typeof player.plusMinus === 'number' ? player.plusMinus : 0}</td>` : '';
        row.innerHTML = `
            <td>${escapeHtml(player.name)}</td>
            <td>${player.gamesWon}/${player.gamesPlayed}</td>
            <td>${player.points}</td>
            <td>${player.goals}</td>
            <td>${player.assists}</td>
            <td>${'🎩'.repeat(player.hattricks)}</td>
            ${plusMinusCell}
        `;
        tbody.appendChild(row);
    });
}

function renderStandingsSidebar() {
    const sidebar = document.querySelector('.standings-sidebar');
    if (!sidebar) return;
    
    const h2 = sidebar.querySelector('h2');
    const container = sidebar.querySelector('.standings-table-container');
    const table = sidebar.querySelector('.standings-table');
    const plusMinusActive = isPlusMinusActiveForSession();
    
    if (h2) h2.textContent = 'Standings';
    if (container) container.style.display = 'block';
    if (table) {
        const thead = table.querySelector('thead');
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th>Player</th>
                    <th>GW/GP</th>
                    <th>Pts</th>
                    <th>G</th>
                    <th>A</th>
                    <th>🎩</th>
                    ${plusMinusActive ? '<th>+/−</th>' : ''}
                </tr>
            `;
        }
    }
    
    // Hide legends if they exist
    const legendsContainer = sidebar.querySelector('.legends-container');
    if (legendsContainer) legendsContainer.style.display = 'none';
    
    updateStandings();
}

function renderLegends() {
    const sidebar = document.querySelector('.standings-sidebar');
    if (!sidebar) return;
    
    const h2 = sidebar.querySelector('h2');
    const container = sidebar.querySelector('.standings-table-container');
    
    // Hide standings table
    if (container) container.style.display = 'none';
    
    // Update header
    if (h2) h2.textContent = 'Legend';
    
    // Create or update legends container
    let legendsContainer = sidebar.querySelector('.legends-container');
    if (!legendsContainer) {
        legendsContainer = document.createElement('div');
        legendsContainer.className = 'legends-container';
        sidebar.insertBefore(legendsContainer, sidebar.querySelector('.logo-container'));
    }
    
    legendsContainer.style.display = 'block';
    
    const legends = [
        { icon: 'crown', name: 'Most Wins' },
        { icon: 'star', name: 'Most Points' },
        { icon: 'bullseye', name: 'Most Goals' },
        { icon: 'assist', name: 'Most Assists' },
        { icon: 'best_def', name: 'Best Defender' },
        { icon: 'mvp', name: 'MVP' },
        { icon: 'hat', name: 'Hattrick' },
        { icon: 'pig', name: 'Pig' }
    ];
    
    legendsContainer.innerHTML = legends.map(legend => {
        const iconHTML = getAwardIconHTML(legend.icon);
        return `
            <div class="legend-item">
                <span class="legend-icon">${iconHTML}</span>
                <span class="legend-name">${escapeHtml(legend.name)}</span>
            </div>
        `;
    }).join('');
}

// Rendering Functions
function renderPlayerEntries() {
    const playerList = document.getElementById('player-list');
    const titleEl = document.getElementById('player-entries-title');
    const continueBtn = document.getElementById('continue-btn');
    
    if (!playerList) return;
    
    playerList.innerHTML = '';
    
    // Show all players (active and inactive)
    AppState.players.forEach(player => {
        const isActive = player.active !== false; // Handle backwards compatibility
        const item = document.createElement('div');
        item.className = 'player-item';
        if (!isActive) {
            item.style.opacity = '0.5';
        }
        item.innerHTML = `
            <span class="player-item-name">${escapeHtml(player.name)}${!isActive ? ' (removed)' : ''}</span>
            ${isActive ? `<button class="remove-player-btn" data-player-id="${player.id}">Remove</button>` : '<span style="color: #999;">Removed</span>'}
        `;
        playerList.appendChild(item);
    });

    // Update Player Entries title with count of players
    if (titleEl) {
        const totalCount = AppState.players.length;
        titleEl.textContent = totalCount > 0
            ? `Player Entries (${totalCount})`
            : 'Player Entries';
    }
    
    // Enable continue button if at least 2 active players
    const activeCount = getActivePlayers().length;
    if (continueBtn) {
        continueBtn.disabled = activeCount < 2;
    }
    
    // Render settings
    renderSettings();

    // Update recurring players dropdown
    renderRecurringPlayersDropdown();
}

function renderRecurringPlayersDropdown() {
    const select = document.getElementById('recurring-player-select');
    if (!select) return;

    // Base option
    select.innerHTML = '';
    const baseOption = document.createElement('option');
    baseOption.value = '';
    baseOption.textContent = 'Recurring players…';
    select.appendChild(baseOption);

    if (!Array.isArray(RecurringPlayers) || RecurringPlayers.length === 0) {
        return;
    }

    const existingNames = new Set(
        AppState.players.map(p => (p.name || '').toLowerCase())
    );

    // Sort alphabetically by name for easier scanning
    const sorted = [...RecurringPlayers].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    sorted.forEach(p => {
        const name = (p.name || '').trim();
        if (!name) return;
        if (existingNames.has(name.toLowerCase())) return;

        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

function showPlayerEntriesView() {
    const playerEntriesContent = document.getElementById('player-entries-content');
    const settingsPanel = document.getElementById('settings-panel');
    const title = document.getElementById('player-entries-title');
    const settingsBtn = document.getElementById('settings-btn');
    const continueBtn = document.getElementById('continue-btn');
    
    if (playerEntriesContent) {
        playerEntriesContent.style.display = 'flex';
    }
    if (settingsPanel) {
        settingsPanel.style.display = 'none';
    }
    if (title) {
        title.textContent = 'Player Entries';
    }
    if (settingsBtn) {
        settingsBtn.style.display = 'block';
    }
    if (continueBtn) {
        continueBtn.style.display = 'block';
    }
}

function showSettingsView() {
    const playerEntriesContent = document.getElementById('player-entries-content');
    const settingsPanel = document.getElementById('settings-panel');
    const title = document.getElementById('player-entries-title');
    const settingsBtn = document.getElementById('settings-btn');
    const continueBtn = document.getElementById('continue-btn');
    
    if (playerEntriesContent) {
        playerEntriesContent.style.display = 'none';
    }
    if (settingsPanel) {
        settingsPanel.style.display = 'block';
    }
    if (title) {
        title.textContent = 'Settings';
    }
    if (settingsBtn) {
        settingsBtn.style.display = 'none';
    }
    if (continueBtn) {
        continueBtn.style.display = 'none';
    }
    
    // Render settings to ensure UI is up to date
    renderSettings();
}

function renderSettings() {
    // Update assists toggle
    const assistsToggle = document.getElementById('setting-assists-enabled');
    const assistsStatus = document.getElementById('assists-status');
    if (assistsToggle) {
        assistsToggle.checked = AppState.settings.assistsEnabled;
    }
    if (assistsStatus) {
        assistsStatus.textContent = AppState.settings.assistsEnabled ? 'ON' : 'OFF';
    }
    
    // Update max score toggle
    const maxScoreToggle = document.getElementById('setting-max-score-enabled');
    const maxScoreStatus = document.getElementById('max-score-enabled-status');
    const maxScoreContainer = document.getElementById('max-score-selector-container');
    const maxScoreSelector = document.getElementById('setting-max-score-value');
    
    if (maxScoreToggle) {
        maxScoreToggle.checked = AppState.settings.maxScoreEnabled;
    }
    if (maxScoreStatus) {
        maxScoreStatus.textContent = AppState.settings.maxScoreEnabled ? 'ON' : 'OFF';
    }
    if (maxScoreContainer) {
        maxScoreContainer.style.display = AppState.settings.maxScoreEnabled ? 'block' : 'none';
    }
    if (maxScoreSelector) {
        maxScoreSelector.value = AppState.settings.maxScore.toString();
    }
    
    // Update pig award toggle (inverted logic: checked = disabled, unchecked = enabled)
    const pigAwardToggle = document.getElementById('setting-pig-award-enabled');
    const pigAwardStatus = document.getElementById('pig-award-status');
    if (pigAwardToggle) {
        // Invert: if enabled (true), toggle is unchecked (NO); if disabled (false), toggle is checked (YES)
        pigAwardToggle.checked = !AppState.settings.pigAwardEnabled;
    }
    if (pigAwardStatus) {
        // Show YES if disabled (checked), NO if enabled (unchecked)
        pigAwardStatus.textContent = AppState.settings.pigAwardEnabled ? 'NO' : 'YES';
    }
    
    // Update random teams toggle
    const randomTeamsToggle = document.getElementById('setting-random-teams-enabled');
    const randomTeamsStatus = document.getElementById('random-teams-status');
    if (randomTeamsToggle) {
        randomTeamsToggle.checked = AppState.settings.randomTeamsEnabled;
    }
    if (randomTeamsStatus) {
        randomTeamsStatus.textContent = AppState.settings.randomTeamsEnabled ? 'ON' : 'OFF';
    }

    // Goalkeepers toggle and list
    const goalkeepersToggle = document.getElementById('setting-goalkeepers-enabled');
    const goalkeepersStatus = document.getElementById('goalkeepers-status');
    const goalkeepersListContainer = document.getElementById('goalkeepers-list-container');
    const goalkeepersList = document.getElementById('goalkeeper-list');
    const recurringPlayersList = document.getElementById('recurring-players-list');
    if (goalkeepersToggle) {
        goalkeepersToggle.checked = AppState.settings.goalkeepersEnabled;
    }
    if (goalkeepersStatus) {
        goalkeepersStatus.textContent = AppState.settings.goalkeepersEnabled ? 'YES' : 'NO';
    }
    if (goalkeepersListContainer) {
        goalkeepersListContainer.style.display = AppState.settings.goalkeepersEnabled ? 'block' : 'none';
    }
    if (goalkeepersList) {
        goalkeepersList.innerHTML = '';
        AppState.goalkeepers.forEach(gk => {
            const item = document.createElement('div');
            item.className = 'goalkeeper-item';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'goalkeeper-item-name';
            nameSpan.textContent = gk.name;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-goalkeeper-btn';
            removeBtn.textContent = 'Remove';
            removeBtn.setAttribute('data-goalkeeper-id', gk.id);
            item.appendChild(nameSpan);
            item.appendChild(removeBtn);
            goalkeepersList.appendChild(item);
        });
    }

    // Recurring players list (managed separately from session players)
    if (recurringPlayersList) {
        recurringPlayersList.innerHTML = '';

        if (Array.isArray(RecurringPlayers) && RecurringPlayers.length > 0) {
            const sorted = [...RecurringPlayers].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
            );

            sorted.forEach(p => {
                const name = (p.name || '').trim();
                if (!name) return;

                const item = document.createElement('div');
                item.className = 'goalkeeper-item';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'goalkeeper-item-name';
                nameSpan.textContent = name;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-goalkeeper-btn';
                removeBtn.textContent = 'Remove';
                removeBtn.setAttribute('data-recurring-id', p.id);

                item.appendChild(nameSpan);
                item.appendChild(removeBtn);
                recurringPlayersList.appendChild(item);
            });
        }
    }

    updateRecurringManageUI();

    // Update starting lineup toggle and count
    const startingLineupToggle = document.getElementById('setting-starting-lineup-enabled');
    const startingLineupStatus = document.getElementById('starting-lineup-status');
    const startingLineupCountContainer = document.getElementById('starting-lineup-count-container');
    const startingLineupCountSelector = document.getElementById('setting-starting-lineup-count');
    if (startingLineupToggle) {
        startingLineupToggle.checked = AppState.settings.startingLineupEnabled;
    }
    if (startingLineupStatus) {
        startingLineupStatus.textContent = AppState.settings.startingLineupEnabled ? 'ON' : 'OFF';
    }
    if (startingLineupCountContainer) {
        startingLineupCountContainer.style.display = AppState.settings.startingLineupEnabled ? 'block' : 'none';
    }
    if (startingLineupCountSelector) {
        startingLineupCountSelector.value = AppState.settings.startingLineupCount.toString();
    }

    // Update team name inputs
    const blackTeamNameInput = document.getElementById('setting-black-team-name');
    const whiteTeamNameInput = document.getElementById('setting-white-team-name');
    if (blackTeamNameInput) {
        blackTeamNameInput.value = AppState.settings.blackTeamName;
    }
    if (whiteTeamNameInput) {
        whiteTeamNameInput.value = AppState.settings.whiteTeamName;
    }
}

// Starting player icon for Team Selection (badge with text STARTING)
const STARTING_PLAYER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="22" viewBox="0 0 72 22" class="starting-player-icon-svg" aria-hidden="true"><rect x="0" y="0" width="72" height="22" rx="4" fill="#2d5a27" stroke="#1a3518" stroke-width="1.5"/><text x="36" y="15" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#a8e6a0" letter-spacing="0.5">STARTING</text></svg>`;
// Substitute player icon (same size/layout, light blue, SUBST)
const SUBST_PLAYER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="22" viewBox="0 0 72 22" class="starting-player-icon-svg" aria-hidden="true"><rect x="0" y="0" width="72" height="22" rx="4" fill="#5a9fd4" stroke="#2a6a94" stroke-width="1.5"/><text x="36" y="15" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#e8f4fc" letter-spacing="0.5">SUBST</text></svg>`;
const LATE_PLAYER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="22" viewBox="0 0 72 22" class="starting-player-icon-svg" aria-hidden="true"><rect x="0" y="0" width="72" height="22" rx="4" fill="#8a4a1a" stroke="#5a3010" stroke-width="1.5"/><text x="36" y="15" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#ffe8c8" letter-spacing="0.5">LATE</text></svg>`;

function renderTeamPlayerBadge(container, player, starters) {
    if (isPlayerLateJoiner(player.id)) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'starting-player-icon';
        iconSpan.title = 'Joined after own team scored — no win credit';
        iconSpan.innerHTML = LATE_PLAYER_ICON_SVG;
        container.appendChild(iconSpan);
    } else if (AppState.settings.startingLineupEnabled && AppState.currentStartingLineup) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'starting-player-icon';
        if (starters.includes(player.id)) {
            iconSpan.title = 'Starting player';
            iconSpan.innerHTML = STARTING_PLAYER_ICON_SVG;
        } else {
            iconSpan.title = 'Substitute';
            iconSpan.innerHTML = SUBST_PLAYER_ICON_SVG;
        }
        container.appendChild(iconSpan);
    }
}

function renderTeamAddPlayerControls(teamSide, teamDiv) {
    if (!AppState.viewingTeamsFromGame || !AppState.currentGame || !AppState.teamAddPlayerMode) return;

    const form = document.createElement('div');
    form.className = 'team-add-player-form';

    const select = document.createElement('select');
    select.id = `add-player-select-${teamSide}`;
    select.className = 'add-player-during-game-select player-name-input-style';
    select.setAttribute('data-team-side', teamSide);

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Add player…';
    select.appendChild(defaultOpt);

    getPlayersNotOnCurrentTeams().forEach(player => {
        const opt = document.createElement('option');
        opt.value = player.id;
        opt.textContent = player.name;
        select.appendChild(opt);
    });

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = 'Enter new name…';
    select.appendChild(newOpt);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `add-player-input-${teamSide}`;
    input.className = 'team-add-player-input';
    input.placeholder = 'New player name';
    input.maxLength = 30;
    input.style.display = 'none';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-primary add-player-during-game-btn';
    addBtn.textContent = 'Add';
    addBtn.setAttribute('data-team-side', teamSide);

    form.appendChild(select);
    form.appendChild(input);
    form.appendChild(addBtn);
    teamDiv.appendChild(form);
}

function renderTeamDisplay(teams) {
    if (!teams) return;

    const shuffling = !!AppState.teamShuffleAnimating;
    
    // Update team headers with custom names
    const blackTeamHeader = document.querySelector('.team-section.team-black h2');
    const whiteTeamHeader = document.querySelector('.team-section.team-white h2');
    if (blackTeamHeader) {
        blackTeamHeader.textContent = AppState.settings.blackTeamName;
    }
    if (whiteTeamHeader) {
        whiteTeamHeader.textContent = AppState.settings.whiteTeamName;
    }
    
    const blackTeamDiv = document.getElementById('black-team-players');
    const whiteTeamDiv = document.getElementById('white-team-players');
    
    if (blackTeamDiv) {
        blackTeamDiv.innerHTML = '';
        const blackStarters = AppState.settings.startingLineupEnabled && AppState.currentStartingLineup ? AppState.currentStartingLineup.blackTeam : [];
        teams.blackTeam.forEach(player => {
            const container = document.createElement('div');
            container.className = 'team-player-item';
            
            renderTeamPlayerBadge(container, player, blackStarters);
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'team-player-name';
            nameDiv.textContent = player.name;
            container.appendChild(nameDiv);
            
            // Add move and remove buttons only in edit mode (pre-game)
            if (AppState.teamEditMode && !shuffling) {
                const moveBtn = document.createElement('button');
                moveBtn.className = 'move-player-btn move-right';
                moveBtn.textContent = '→';
                moveBtn.setAttribute('data-player-id', player.id);
                moveBtn.setAttribute('data-from-team', 'blackTeam');
                moveBtn.setAttribute('data-to-team', 'whiteTeam');
                moveBtn.title = 'Move to White Team';
                container.appendChild(moveBtn);
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-from-teams-btn';
                removeBtn.textContent = 'Remove';
                removeBtn.setAttribute('data-player-id', player.id);
                removeBtn.title = 'Remove from game';
                container.appendChild(removeBtn);
            } else if (AppState.teamRemovePlayerMode && !shuffling) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-during-game-btn';
                removeBtn.textContent = 'Remove';
                removeBtn.setAttribute('data-player-id', player.id);
                removeBtn.title = 'Remove from this game';
                container.appendChild(removeBtn);
            }
            
            blackTeamDiv.appendChild(container);
        });

        if (!shuffling) {
            renderTeamAddPlayerControls('black', blackTeamDiv);
        }

        // Goalkeeper selector for black team
        if (!shuffling && AppState.settings.goalkeepersEnabled && AppState.goalkeepers.length > 0) {
            const gkContainer = document.createElement('div');
            gkContainer.className = 'team-goalkeeper-selector';
            const label = document.createElement('span');
            label.textContent = 'Goalkeeper:';
            const select = document.createElement('select');
            select.id = 'black-gk-select';
            const noneOption = document.createElement('option');
            noneOption.value = '';
            noneOption.textContent = 'None';
            select.appendChild(noneOption);
            AppState.goalkeepers.forEach(gk => {
                const opt = document.createElement('option');
                opt.value = gk.id;
                opt.textContent = gk.name;
                if (teams.blackGKId && teams.blackGKId === gk.id) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
            select.addEventListener('change', () => {
                const value = select.value || null;
                if (!AppState.currentTeams) return;
                AppState.currentTeams.blackGKId = value;
                saveSession();
            });
            gkContainer.appendChild(label);
            gkContainer.appendChild(select);
            blackTeamDiv.appendChild(gkContainer);
        }
    }
    
    if (whiteTeamDiv) {
        whiteTeamDiv.innerHTML = '';
        const whiteStarters = AppState.settings.startingLineupEnabled && AppState.currentStartingLineup ? AppState.currentStartingLineup.whiteTeam : [];
        teams.whiteTeam.forEach(player => {
            const container = document.createElement('div');
            container.className = 'team-player-item';
            
            renderTeamPlayerBadge(container, player, whiteStarters);
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'team-player-name';
            nameDiv.textContent = player.name;
            container.appendChild(nameDiv);
            
            // Add move and remove buttons only in edit mode (pre-game)
            if (AppState.teamEditMode && !shuffling) {
                const moveBtn = document.createElement('button');
                moveBtn.className = 'move-player-btn move-left';
                moveBtn.textContent = '←';
                moveBtn.setAttribute('data-player-id', player.id);
                moveBtn.setAttribute('data-from-team', 'whiteTeam');
                moveBtn.setAttribute('data-to-team', 'blackTeam');
                moveBtn.title = 'Move to Black Team';
                container.appendChild(moveBtn);
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-from-teams-btn';
                removeBtn.textContent = 'Remove';
                removeBtn.setAttribute('data-player-id', player.id);
                removeBtn.title = 'Remove from game';
                container.appendChild(removeBtn);
            } else if (AppState.teamRemovePlayerMode && !shuffling) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-during-game-btn';
                removeBtn.textContent = 'Remove';
                removeBtn.setAttribute('data-player-id', player.id);
                removeBtn.title = 'Remove from this game';
                container.appendChild(removeBtn);
            }
            
            whiteTeamDiv.appendChild(container);
        });

        if (!shuffling) {
            renderTeamAddPlayerControls('white', whiteTeamDiv);
        }

        // Goalkeeper selector for white team
        if (!shuffling && AppState.settings.goalkeepersEnabled && AppState.goalkeepers.length > 0) {
            const gkContainer = document.createElement('div');
            gkContainer.className = 'team-goalkeeper-selector';
            const label = document.createElement('span');
            label.textContent = 'Goalkeeper:';
            const select = document.createElement('select');
            select.id = 'white-gk-select';
            const noneOption = document.createElement('option');
            noneOption.value = '';
            noneOption.textContent = 'None';
            select.appendChild(noneOption);
            AppState.goalkeepers.forEach(gk => {
                const opt = document.createElement('option');
                opt.value = gk.id;
                opt.textContent = gk.name;
                if (teams.whiteGKId && teams.whiteGKId === gk.id) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
            select.addEventListener('change', () => {
                const value = select.value || null;
                if (!AppState.currentTeams) return;
                AppState.currentTeams.whiteGKId = value;
                saveSession();
            });
            gkContainer.appendChild(label);
            gkContainer.appendChild(select);
            whiteTeamDiv.appendChild(gkContainer);
        }
    }
    
    // Update REMATCH button visibility
    const rematchBtn = document.getElementById('rematch-btn');
    if (rematchBtn) {
        rematchBtn.style.display = AppState.previousTeams ? 'block' : 'none';
    }
    
    // Update EDIT TEAMS button text
    const editTeamsBtn = document.getElementById('edit-teams-btn');
    if (editTeamsBtn) {
        editTeamsBtn.textContent = AppState.teamEditMode ? 'Done Editing' : 'Edit Teams';
    }
    
    // Adjust font sizes to ensure all players are visible without scrolling
    if (!shuffling) {
        setTimeout(() => adjustTeamSelectionFontSize(), 10);
    }
}

function clearTeamShuffleAnimation() {
    if (teamShuffleTimer !== null) {
        clearTimeout(teamShuffleTimer);
        teamShuffleTimer = null;
    }
    const wasAnimating = AppState.teamShuffleAnimating;
    AppState.teamShuffleAnimating = false;
    const teamsContainer = document.querySelector('.teams-container');
    if (teamsContainer) {
        teamsContainer.classList.remove('team-shuffle-active');
    }
    if (wasAnimating) {
        setTeamSelectionControlsEnabled(true);
    }
}

function setTeamSelectionControlsEnabled(enabled) {
    [
        'rematch-btn',
        'edit-teams-btn',
        'swap-sides-btn',
        'finish-session-team-selection-btn',
        'start-game-btn'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enabled;
    });
}

function createRandomTeamPreview(allPlayers, blackCount, gkIds) {
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
    return {
        blackTeam: shuffled.slice(0, blackCount),
        whiteTeam: shuffled.slice(blackCount),
        blackGKId: gkIds.blackGKId || null,
        whiteGKId: gkIds.whiteGKId || null
    };
}

function startTeamShuffleAnimation(finalTeams) {
    clearTeamShuffleAnimation();
    if (!finalTeams) return;

    AppState.teamShuffleAnimating = true;
    setTeamSelectionControlsEnabled(false);
    clearStartGameCountdown();

    const teamsContainer = document.querySelector('.teams-container');
    if (teamsContainer) {
        teamsContainer.classList.add('team-shuffle-active');
    }

    const allPlayers = [...finalTeams.blackTeam, ...finalTeams.whiteTeam];
    const blackCount = finalTeams.blackTeam.length;
    const gkIds = {
        blackGKId: finalTeams.blackGKId || null,
        whiteGKId: finalTeams.whiteGKId || null
    };

    const savedLineup = AppState.currentStartingLineup;
    AppState.currentStartingLineup = null;

    const start = Date.now();

    function frame() {
        const elapsed = Date.now() - start;
        if (elapsed >= TEAM_SHUFFLE_DURATION_MS || AppState.currentScreen !== 'team-selection') {
            AppState.currentStartingLineup = savedLineup;
            clearTeamShuffleAnimation();
            renderTeamDisplay(finalTeams);
            if (AppState.currentScreen === 'team-selection' && !AppState.viewingTeamsFromGame) {
                startStartGameCountdown();
            }
            return;
        }

        const progress = elapsed / TEAM_SHUFFLE_DURATION_MS;
        const delay = Math.round(50 + progress * progress * 320);

        renderTeamDisplay(createRandomTeamPreview(allPlayers, blackCount, gkIds));
        teamShuffleTimer = setTimeout(frame, delay);
    }

    frame();
}

function renderTeamSelection() {
    // Save current teams as previous teams before randomizing new ones
    if (AppState.currentTeams) {
        AppState.previousTeams = {
            blackTeam: [...AppState.currentTeams.blackTeam],
            whiteTeam: [...AppState.currentTeams.whiteTeam],
            blackGKId: AppState.currentTeams.blackGKId || null,
            whiteGKId: AppState.currentTeams.whiteGKId || null
        };
    }
    
    // Reset edit mode when randomizing teams
    AppState.teamEditMode = false;
    
    const previousGKIds = {
        blackGKId: AppState.currentTeams ? AppState.currentTeams.blackGKId || null : null,
        whiteGKId: AppState.currentTeams ? AppState.currentTeams.whiteGKId || null : null
    };

    let didRandomize = false;

    // Only randomize if random teams is enabled, otherwise keep current teams
    if (AppState.settings.randomTeamsEnabled) {
        // Randomize teams and store them
        const teams = randomizeTeams();
        if (!teams) return;
        AppState.currentTeams = {
            blackTeam: teams.blackTeam,
            whiteTeam: teams.whiteTeam,
            blackGKId: previousGKIds.blackGKId,
            whiteGKId: previousGKIds.whiteGKId
        };
        didRandomize = true;
    } else {
        // Keep current teams, but ensure they exist
        if (!AppState.currentTeams) {
            const teams = randomizeTeams();
            if (!teams) return;
            AppState.currentTeams = {
                blackTeam: teams.blackTeam,
                whiteTeam: teams.whiteTeam,
                blackGKId: previousGKIds.blackGKId,
                whiteGKId: previousGKIds.whiteGKId
            };
            didRandomize = true;
        }
    }

    if (AppState.settings.startingLineupEnabled) {
        AppState.currentStartingLineup = pickRandomStarters(AppState.currentTeams);
    } else {
        AppState.currentStartingLineup = null;
    }

    if (didRandomize) {
        startTeamShuffleAnimation(AppState.currentTeams);
    } else {
        clearTeamShuffleAnimation();
        renderTeamDisplay(AppState.currentTeams);
    }
}

function toggleTeamEditMode() {
    AppState.teamEditMode = !AppState.teamEditMode;
    if (AppState.currentTeams) {
        renderTeamDisplay(AppState.currentTeams);
    }
}

function swapTeamSides() {
    if (!AppState.currentTeams) return;
    // Swap only field player lineups (left <-> right); keep goalkeepers on their side
    const { blackTeam, whiteTeam, blackGKId, whiteGKId } = AppState.currentTeams;
    AppState.currentTeams = {
        blackTeam: [...whiteTeam],
        whiteTeam: [...blackTeam],
        blackGKId: blackGKId || null,
        whiteGKId: whiteGKId || null
    };
    // Swap starting lineup if enabled
    if (AppState.currentStartingLineup) {
        AppState.currentStartingLineup = {
            blackTeam: [...AppState.currentStartingLineup.whiteTeam],
            whiteTeam: [...AppState.currentStartingLineup.blackTeam]
        };
    }
    // Swap left/right team names so colors and labels swap (white on left, black on right)
    const leftName = AppState.settings.blackTeamName;
    const rightName = AppState.settings.whiteTeamName;
    AppState.settings.blackTeamName = rightName;
    AppState.settings.whiteTeamName = leftName;
    saveSession();
    applyTeamColors();
    renderTeamDisplay(AppState.currentTeams);
}

function movePlayerBetweenTeams(playerId, fromTeam, toTeam) {
    if (!AppState.currentTeams || !AppState.currentTeams[fromTeam] || !AppState.currentTeams[toTeam]) {
        return;
    }
    
    // Find player in source team
    const playerIndex = AppState.currentTeams[fromTeam].findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
        return; // Player not found
    }
    
    // Remove player from source team
    const player = AppState.currentTeams[fromTeam].splice(playerIndex, 1)[0];
    
    // Add player to destination team
    AppState.currentTeams[toTeam].push(player);
    
    // Update display
    renderTeamDisplay(AppState.currentTeams);
}

function getPlayersNotOnCurrentTeams() {
    if (!AppState.currentTeams) return [];
    const onTeamIds = new Set([
        ...AppState.currentTeams.blackTeam.map(p => p.id),
        ...AppState.currentTeams.whiteTeam.map(p => p.id)
    ]);
    return AppState.players.filter(p => !onTeamIds.has(p.id));
}

function isPlayerLateJoiner(playerId) {
    return !!(AppState.currentGame?.lateJoinerIds?.includes(playerId));
}

function wasPlayerOnTeamForGoal(playerId, goalIndex, game = AppState.currentGame) {
    const joinedAt = game?.playerJoinedAtGoalCount?.[playerId] ?? 0;
    if (joinedAt > goalIndex) return false;
    const leftAt = game?.playerLeftAtGoalCount?.[playerId];
    if (leftAt !== undefined && leftAt !== null && leftAt <= goalIndex) return false;
    return true;
}

function getTeamPlayersForPlusMinus(game, teamSide, goalIndex) {
    if (!game) return [];
    const teamKey = teamSide === 'black' ? 'blackTeam' : 'whiteTeam';
    const onRoster = (Array.isArray(game[teamKey]) ? game[teamKey] : [])
        .filter(p => wasPlayerOnTeamForGoal(p.id, goalIndex, game))
        .map(p => ({ id: p.id }));

    const removed = (Array.isArray(game.removedPlayers) ? game.removedPlayers : [])
        .filter(rp => rp.team === teamSide && wasPlayerOnTeamForGoal(rp.id, goalIndex, game))
        .map(rp => ({ id: rp.id }));

    const seen = new Set();
    const combined = [];
    [...onRoster, ...removed].forEach(p => {
        if (seen.has(p.id)) return;
        seen.add(p.id);
        combined.push(p);
    });
    return combined;
}

function removePlayerFromTeamDuringGame(playerId) {
    if (!AppState.viewingTeamsFromGame || !AppState.currentGame || !AppState.currentTeams) {
        return false;
    }

    let teamSide = null;
    if (AppState.currentTeams.blackTeam.some(p => p.id === playerId)) {
        teamSide = 'black';
    } else if (AppState.currentTeams.whiteTeam.some(p => p.id === playerId)) {
        teamSide = 'white';
    }
    if (!teamSide) return false;

    const teamKey = teamSide === 'black' ? 'blackTeam' : 'whiteTeam';
    if (AppState.currentTeams[teamKey].length <= 1) {
        alert('A team needs at least one player.');
        return false;
    }

    const player = AppState.players.find(p => p.id === playerId);
    const playerName = player ? player.name : 'this player';
    if (!confirm(`Remove ${playerName} from this game?`)) {
        return false;
    }

    const ownTeamScore = teamSide === 'black'
        ? AppState.currentGame.blackScore
        : AppState.currentGame.whiteScore;
    // Win credit if they stayed through own team's 2nd goal (late joiners still excluded at endGame)
    const winCredit = ownTeamScore >= 2;
    const leftAtGoalCount = AppState.currentGame.goals.length;

    if (!AppState.currentGame.removedPlayers) {
        AppState.currentGame.removedPlayers = [];
    }
    if (!AppState.currentGame.playerLeftAtGoalCount) {
        AppState.currentGame.playerLeftAtGoalCount = {};
    }

    AppState.currentGame.removedPlayers.push({
        id: playerId,
        team: teamSide,
        winCredit,
        leftAtGoalCount
    });
    AppState.currentGame.playerLeftAtGoalCount[playerId] = leftAtGoalCount;

    AppState.currentTeams.blackTeam = AppState.currentTeams.blackTeam.filter(p => p.id !== playerId);
    AppState.currentTeams.whiteTeam = AppState.currentTeams.whiteTeam.filter(p => p.id !== playerId);

    if (AppState.currentStartingLineup) {
        AppState.currentStartingLineup.blackTeam = (AppState.currentStartingLineup.blackTeam || [])
            .filter(id => id !== playerId);
        AppState.currentStartingLineup.whiteTeam = (AppState.currentStartingLineup.whiteTeam || [])
            .filter(id => id !== playerId);
    }

    saveSession();
    updateStandings();
    renderTeamDisplay(AppState.currentTeams);
    return true;
}

function addPlayerToTeamDuringGame(teamSide, playerId) {
    if (!AppState.viewingTeamsFromGame || !AppState.currentGame || !AppState.currentTeams) {
        return false;
    }
    if (teamSide !== 'black' && teamSide !== 'white') return false;

    const player = AppState.players.find(p => p.id === playerId);
    if (!player) return false;

    const teamKey = teamSide === 'black' ? 'blackTeam' : 'whiteTeam';
    const onTeam = [...AppState.currentTeams.blackTeam, ...AppState.currentTeams.whiteTeam]
        .some(p => p.id === playerId);
    if (onTeam) return false;

    if (player.active === false) {
        player.active = true;
    }

    AppState.currentTeams[teamKey].push({ id: player.id, name: player.name });

    // If they left earlier this game and are rejoining, clear leave records
    if (AppState.currentGame.playerLeftAtGoalCount) {
        delete AppState.currentGame.playerLeftAtGoalCount[player.id];
    }
    if (Array.isArray(AppState.currentGame.removedPlayers)) {
        AppState.currentGame.removedPlayers = AppState.currentGame.removedPlayers
            .filter(rp => rp.id !== player.id);
    }

    if (!AppState.currentGame.lateJoinerIds) {
        AppState.currentGame.lateJoinerIds = [];
    }
    if (!AppState.currentGame.playerJoinedAtGoalCount) {
        AppState.currentGame.playerJoinedAtGoalCount = {};
    }
    AppState.currentGame.playerJoinedAtGoalCount[player.id] = AppState.currentGame.goals.length;
    // No win credit only if this player's own team has already scored
    const ownTeamScore = teamSide === 'black'
        ? AppState.currentGame.blackScore
        : AppState.currentGame.whiteScore;
    AppState.currentGame.lateJoinerIds = AppState.currentGame.lateJoinerIds.filter(id => id !== player.id);
    if (ownTeamScore > 0) {
        AppState.currentGame.lateJoinerIds.push(player.id);
    }

    saveSession();
    updateStandings();
    renderTeamDisplay(AppState.currentTeams);
    return true;
}

function addNewPlayerToTeamDuringGame(teamSide, name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return false;

    const existing = AppState.players.find(
        p => (p.name || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
        return addPlayerToTeamDuringGame(teamSide, existing.id);
    }

    if (!addPlayer(trimmed)) return false;
    const player = AppState.players.find(
        p => (p.name || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (!player) return false;

    return addPlayerToTeamDuringGame(teamSide, player.id);
}

function handleAddPlayerDuringGame(teamSide) {
    const select = document.getElementById(`add-player-select-${teamSide}`);
    if (!select) return;

    const value = select.value;
    if (!value) return;

    let success = false;
    if (value === '__new__') {
        const input = document.getElementById(`add-player-input-${teamSide}`);
        const name = input ? input.value : '';
        success = addNewPlayerToTeamDuringGame(teamSide, name);
        if (success && input) input.value = '';
    } else {
        success = addPlayerToTeamDuringGame(teamSide, value);
    }

    if (success) {
        select.value = '';
        const input = document.getElementById(`add-player-input-${teamSide}`);
        if (input) {
            input.value = '';
            input.style.display = 'none';
        }
    }
}

function toggleTeamAddPlayerMode() {
    if (!AppState.viewingTeamsFromGame || !AppState.currentGame) return;
    AppState.teamAddPlayerMode = !AppState.teamAddPlayerMode;
    if (AppState.teamAddPlayerMode) {
        AppState.teamRemovePlayerMode = false;
    }
    if (AppState.currentTeams) {
        renderTeamDisplay(AppState.currentTeams);
    }
    updateTeamSelectionFooterPlayerButtons();
}

function toggleTeamRemovePlayerMode() {
    if (!AppState.viewingTeamsFromGame || !AppState.currentGame) return;
    AppState.teamRemovePlayerMode = !AppState.teamRemovePlayerMode;
    if (AppState.teamRemovePlayerMode) {
        AppState.teamAddPlayerMode = false;
    }
    if (AppState.currentTeams) {
        renderTeamDisplay(AppState.currentTeams);
    }
    updateTeamSelectionFooterPlayerButtons();
}

function updateTeamSelectionFooterPlayerButtons() {
    const addPlayerDuringGameBtn = document.getElementById('add-player-during-game-toggle-btn');
    if (addPlayerDuringGameBtn && AppState.viewingTeamsFromGame && AppState.currentGame) {
        addPlayerDuringGameBtn.textContent = AppState.teamAddPlayerMode ? 'Done' : 'Add Player';
    }
    const removePlayerDuringGameBtn = document.getElementById('remove-player-during-game-toggle-btn');
    if (removePlayerDuringGameBtn && AppState.viewingTeamsFromGame && AppState.currentGame) {
        removePlayerDuringGameBtn.textContent = AppState.teamRemovePlayerMode ? 'Done' : 'Remove Player';
    }
}

function updateTeamSelectionFooterAddPlayerButton() {
    updateTeamSelectionFooterPlayerButtons();
}

function playRematch() {
    if (!AppState.previousTeams) return;
    
    const confirmed = confirm('Do you want to change the teams to the previous lineup?');
    if (confirmed) {
        // Restore previous teams
        AppState.currentTeams = {
            blackTeam: [...AppState.previousTeams.blackTeam],
            whiteTeam: [...AppState.previousTeams.whiteTeam],
            blackGKId: AppState.previousTeams.blackGKId || null,
            whiteGKId: AppState.previousTeams.whiteGKId || null
        };

        if (AppState.settings.startingLineupEnabled) {
            AppState.currentStartingLineup = pickRandomStarters(AppState.currentTeams);
        } else {
            AppState.currentStartingLineup = null;
        }

        // Re-render the display
        renderTeamDisplay(AppState.currentTeams);
    }
}

function renderGameProgress() {
    if (!AppState.currentGame) return;
    
    const blackScoreEl = document.getElementById('black-score');
    const whiteScoreEl = document.getElementById('white-score');
    
    if (blackScoreEl) {
        blackScoreEl.textContent = AppState.currentGame.blackScore;
    }
    if (whiteScoreEl) {
        whiteScoreEl.textContent = AppState.currentGame.whiteScore;
    }
    
    // Update team name labels
    const blackLabel = document.querySelector('.score-black .score-label');
    const whiteLabel = document.querySelector('.score-white .score-label');
    const blackGoalBtn = document.getElementById('black-goal-btn');
    const whiteGoalBtn = document.getElementById('white-goal-btn');
    
    if (blackLabel) {
        blackLabel.textContent = getTeamNameShort('black');
    }
    if (whiteLabel) {
        whiteLabel.textContent = getTeamNameShort('white');
    }
    if (blackGoalBtn) {
        blackGoalBtn.textContent = `${getTeamNameShort('black')} GOAL`;
    }
    if (whiteGoalBtn) {
        whiteGoalBtn.textContent = `${getTeamNameShort('white')} GOAL`;
    }
    
    // Disable goal buttons if max score is reached
    // Disable both buttons if either team reaches max score
    if (AppState.settings.maxScoreEnabled) {
        const maxScoreReached = AppState.currentGame.blackScore >= AppState.settings.maxScore || 
                                AppState.currentGame.whiteScore >= AppState.settings.maxScore;
        if (blackGoalBtn) {
            blackGoalBtn.disabled = maxScoreReached;
        }
        if (whiteGoalBtn) {
            whiteGoalBtn.disabled = maxScoreReached;
        }
    } else {
        // Ensure buttons are enabled if max score is disabled
        if (blackGoalBtn) {
            blackGoalBtn.disabled = false;
        }
        if (whiteGoalBtn) {
            whiteGoalBtn.disabled = false;
        }
    }
    
    // Undo last goal: enable only when there is at least one goal
    const undoGoalBtn = document.getElementById('undo-goal-btn');
    if (undoGoalBtn) {
        undoGoalBtn.disabled = !AppState.currentGame.goals.length;
    }

    // Back to Team Selection: show only when score is 0-0 (no goals registered)
    const backToTeamSelectionBtn = document.getElementById('back-to-team-selection-btn');
    if (backToTeamSelectionBtn) {
        const isZeroZero = AppState.currentGame.blackScore === 0 && AppState.currentGame.whiteScore === 0;
        backToTeamSelectionBtn.style.display = isZeroZero ? '' : 'none';
    }
}

function renderGamesHistory() {
    const list = document.getElementById('games-history-list');
    if (!list) return;

    const games = AppState.gameHistory || [];
    list.innerHTML = '';

    if (!games.length) {
        const empty = document.createElement('div');
        empty.className = 'game-item';
        empty.textContent = 'No games played yet.';
        list.appendChild(empty);
        return;
    }

    const items = games.map((game, index) => ({ game, index })).reverse();

    items.forEach(({ game, index }) => {
        if (!game) return;
        const item = document.createElement('div');
        item.className = 'game-item';
        item.setAttribute('data-game-index', String(index));

        const blackScore = typeof game.blackScore === 'number' ? game.blackScore : 0;
        const whiteScore = typeof game.whiteScore === 'number' ? game.whiteScore : 0;
        const gameNumber = game.gameNumber || (index + 1);

        const header = document.createElement('div');
        header.className = 'game-item-header';
        header.innerHTML = `
            <div class="game-item-title">Game ${gameNumber}</div>
            <div class="game-item-score">${getTeamNameShort('black')} ${blackScore} - ${whiteScore} ${getTeamNameShort('white')}</div>
        `;
        item.appendChild(header);

        const goalsCount = Array.isArray(game.goals) ? game.goals.length : 0;
        const meta = document.createElement('div');
        meta.className = 'game-item-meta';
        meta.textContent = `${goalsCount} goal${goalsCount === 1 ? '' : 's'}`;
        item.appendChild(meta);

        const isEditing = AppState.editingGameIndex === index;

        if (isEditing) {
            const editSection = document.createElement('div');
            editSection.className = 'game-edit-section';

            const scoresRow = document.createElement('div');
            scoresRow.className = 'game-edit-scores';
            scoresRow.innerHTML = `
                <span class="game-goal-label">${getTeamNameShort('black')} score:</span>
                <input type="number" class="game-score-input" data-team="black" min="0" value="${blackScore}">
                <span class="game-goal-label">${getTeamNameShort('white')} score:</span>
                <input type="number" class="game-score-input" data-team="white" min="0" value="${whiteScore}">
            `;
            editSection.appendChild(scoresRow);

            const goalsList = document.createElement('div');
            goalsList.className = 'game-goals-list';

            const gamePlayersMap = {};
            const addPlayersFromTeam = (teamArr) => {
                (teamArr || []).forEach(p => {
                    if (p && p.id && !gamePlayersMap[p.id]) {
                        gamePlayersMap[p.id] = p.name || 'Player';
                    }
                });
            };
            addPlayersFromTeam(game.blackTeam);
            addPlayersFromTeam(game.whiteTeam);
            const gamePlayers = Object.keys(gamePlayersMap).map(id => ({ id, name: gamePlayersMap[id] }));

            (game.goals || []).forEach((goal, goalIndex) => {
                const row = document.createElement('div');
                row.className = 'game-goal-row';
                row.setAttribute('data-goal-index', String(goalIndex));

                const teamSelectOptions = `
                    <option value="black"${goal.team === 'black' ? ' selected' : ''}>${getTeamNameShort('black')}</option>
                    <option value="white"${goal.team === 'white' ? ' selected' : ''}>${getTeamNameShort('white')}</option>
                `;

                const scorerOptions = gamePlayers.map(p => {
                    const selected = goal.scorer === p.id ? ' selected' : '';
                    return `<option value="${p.id}"${selected}>${escapeHtml(p.name)}</option>`;
                }).join('');

                const assistOptions = [
                    `<option value="">None</option>`,
                    gamePlayers.map(p => {
                        const selected = goal.assist === p.id ? ' selected' : '';
                        return `<option value="${p.id}"${selected}>${escapeHtml(p.name)}</option>`;
                    }).join('')
                ].join('');

                row.innerHTML = `
                    <span class="game-goal-label">Goal ${goalIndex + 1}:</span>
                    <select class="game-goal-team-select">
                        ${teamSelectOptions}
                    </select>
                    <select class="game-goal-scorer-select">
                        ${scorerOptions}
                    </select>
                    <select class="game-goal-assist-select">
                        ${assistOptions}
                    </select>
                `;

                goalsList.appendChild(row);
            });

            editSection.appendChild(goalsList);

            const footer = document.createElement('div');
            footer.className = 'game-item-footer';
            footer.innerHTML = `
                <button class="btn-secondary game-cancel-edit-btn">Cancel</button>
                <button class="btn-primary game-save-edit-btn">Save</button>
            `;

            editSection.appendChild(footer);
            item.appendChild(editSection);
        } else {
            const footer = document.createElement('div');
            footer.className = 'game-item-footer';
            footer.innerHTML = `
                <button class="btn-secondary game-edit-btn">Edit</button>
                <button class="btn-secondary game-delete-btn">Delete</button>
            `;
            item.appendChild(footer);
        }

        list.appendChild(item);

        if (!isEditing) {
            const editBtn = item.querySelector('.game-edit-btn');
            const deleteBtn = item.querySelector('.game-delete-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    AppState.editingGameIndex = index;
                    renderGamesHistory();
                });
            }
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    if (!confirm('Delete this game permanently? This will update all stats.')) {
                        return;
                    }
                    const gameIndex = index;
                    if (gameIndex >= 0 && gameIndex < AppState.gameHistory.length) {
                        AppState.gameHistory.splice(gameIndex, 1);
                        AppState.editingGameIndex = null;
                        resetAllStatsFromHistory();
                        saveSession();
                        updateStandings();
                        renderGamesHistory();
                    }
                });
            }
        } else {
            const cancelBtn = item.querySelector('.game-cancel-edit-btn');
            const saveBtn = item.querySelector('.game-save-edit-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    AppState.editingGameIndex = null;
                    renderGamesHistory();
                });
            }
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const gameIndex = index;
                    const originalGame = AppState.gameHistory[gameIndex];
                    if (!originalGame) return;

                    const scoreInputs = item.querySelectorAll('.game-score-input');
                    let newBlackScore = 0;
                    let newWhiteScore = 0;
                    scoreInputs.forEach(input => {
                        const team = input.getAttribute('data-team');
                        const value = parseInt(input.value, 10);
                        const safeValue = isNaN(value) || value < 0 ? 0 : value;
                        if (team === 'black') {
                            newBlackScore = safeValue;
                        } else if (team === 'white') {
                            newWhiteScore = safeValue;
                        }
                    });

                    const goalRows = item.querySelectorAll('.game-goal-row');
                    const newGoals = [];
                    let blackGoalsCount = 0;
                    let whiteGoalsCount = 0;

                    goalRows.forEach(row => {
                        const teamSelect = row.querySelector('.game-goal-team-select');
                        const scorerSelect = row.querySelector('.game-goal-scorer-select');
                        const assistSelect = row.querySelector('.game-goal-assist-select');
                        if (!teamSelect || !scorerSelect || !assistSelect) {
                            return;
                        }
                        const team = teamSelect.value === 'white' ? 'white' : 'black';
                        const scorer = scorerSelect.value;
                        const assistValue = assistSelect.value;
                        if (!scorer) {
                            return;
                        }
                        if (team === 'black') {
                            blackGoalsCount++;
                        } else {
                            whiteGoalsCount++;
                        }
                        newGoals.push({
                            team,
                            scorer,
                            assist: assistValue || null,
                            timestamp: Date.now()
                        });
                    });

                    if (blackGoalsCount !== newBlackScore || whiteGoalsCount !== newWhiteScore) {
                        alert('Final score must match the number of goals for each team.');
                        return;
                    }

                    const updatedGame = {
                        ...originalGame,
                        blackScore: newBlackScore,
                        whiteScore: newWhiteScore,
                        goals: newGoals
                    };

                    AppState.gameHistory[gameIndex] = updatedGame;
                    AppState.editingGameIndex = null;
                    resetAllStatsFromHistory();
                    saveSession();
                    updateStandings();
                    renderGamesHistory();
                });
            }
        }
    });
}

function renderGoalRegistration(team) {
    if (!AppState.currentGame) return;
    
    const teamName = getTeamName(team);
    const modalTeamName = document.getElementById('modal-team-name');
    if (modalTeamName) {
        modalTeamName.textContent = `Register Goal - ${teamName}`;
    }
    
    const teamPlayers = team === 'black' 
        ? AppState.currentGame.blackTeam 
        : AppState.currentGame.whiteTeam;
    
    const list = document.getElementById('goal-registration-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    // Add team players (goal scorer is mandatory, so no NONE option)
    teamPlayers.forEach(player => {
        const item = createGoalRegistrationItem(player.name, player.id);
        list.appendChild(item);
    });
    
    // Add NONE option only for assist if assists are enabled (assist is optional)
    if (AppState.settings.assistsEnabled) {
        const noneAssistItem = createAssistNoneItem();
        list.appendChild(noneAssistItem);
    }
    
    AppState.goalRegistration.team = team;
    AppState.goalRegistration.scorer = null;
    AppState.goalRegistration.assist = null;
    
    // If assists are disabled, set assist to null
    if (!AppState.settings.assistsEnabled) {
        AppState.goalRegistration.assist = null;
    }
    
    updateRegisterButtonState();
    
    // Adjust font sizes to ensure all players are visible without scrolling
    setTimeout(() => adjustGoalRegistrationFontSize(), 10);
}

function createGoalRegistrationItem(name, id) {
    const item = document.createElement('div');
    item.className = 'goal-registration-item';
    const assistButton = AppState.settings.assistsEnabled 
        ? `<button class="assist-btn-small" data-player-id="${id}" data-type="assist">ASSIST</button>`
        : '';
    item.innerHTML = `
        <span class="goal-registration-item-name">${escapeHtml(name)}</span>
        <div class="goal-registration-buttons">
            <button class="goal-btn-small" data-player-id="${id}" data-type="goal">GOAL</button>
            ${assistButton}
        </div>
    `;
    return item;
}

function createAssistNoneItem() {
    const item = document.createElement('div');
    item.className = 'goal-registration-item';
    item.innerHTML = `
        <span class="goal-registration-item-name">NONE</span>
        <div class="goal-registration-buttons">
            <span style="width: 100px; display: inline-block;"></span>
            <button class="assist-btn-small" data-player-id="NONE" data-type="assist">ASSIST</button>
        </div>
    `;
    return item;
}

function updateRegisterButtonState() {
    const registerBtn = document.getElementById('register-goal-btn');
    if (!registerBtn) return;
    
    const { scorer, assist } = AppState.goalRegistration;
    // Enable if scorer is selected (mandatory, cannot be NONE)
    const scorerValid = scorer && scorer !== 'NONE';
    
    // If assists are disabled, we don't need to validate assist
    if (!AppState.settings.assistsEnabled) {
        registerBtn.disabled = !scorerValid;
        return;
    }
    
    // If assists are enabled, validate assist (scorer != assist if assist is selected)
    const assistValid = !assist || assist === 'NONE' || assist !== scorer;
    registerBtn.disabled = !scorerValid || !assistValid;
}

function renderGameSummary() {
    if (!AppState.currentGame) return;
    
    const finalBlackScore = document.getElementById('final-black-score');
    const finalWhiteScore = document.getElementById('final-white-score');
    const decisiveGoalDisplay = document.getElementById('decisive-goal-display');
    const goalsTimeline = document.getElementById('goals-timeline-list');
    
    if (finalBlackScore) {
        finalBlackScore.textContent = AppState.currentGame.blackScore;
    }
    if (finalWhiteScore) {
        finalWhiteScore.textContent = AppState.currentGame.whiteScore;
    }
    
    // Update team name labels
    const finalBlackLabel = document.querySelector('.final-score-display .final-score-team:first-child .final-score-label');
    const finalWhiteLabel = document.querySelector('.final-score-display .final-score-team:last-child .final-score-label');
    
    if (finalBlackLabel) {
        finalBlackLabel.textContent = getTeamNameShort('black');
    }
    if (finalWhiteLabel) {
        finalWhiteLabel.textContent = getTeamNameShort('white');
    }
    
    // Hide decisive goal display (we show it inline in the goals list instead)
    if (decisiveGoalDisplay) {
        decisiveGoalDisplay.style.display = 'none';
    }
    
    if (goalsTimeline) {
        goalsTimeline.innerHTML = '';
        
        if (AppState.currentGame.goals.length === 0) {
            const noGoals = document.createElement('div');
            noGoals.className = 'goal-timeline-item';
            noGoals.textContent = 'No goals scored in this game.';
            goalsTimeline.appendChild(noGoals);
        } else {
            // Track running score as we iterate through goals
            let blackScore = 0;
            let whiteScore = 0;
            
            AppState.currentGame.goals.forEach((goal, index) => {
                const item = document.createElement('div');
                item.className = 'goal-timeline-item';
                
                // Update running score based on which team scored
                if (goal.team === 'black') {
                    blackScore++;
                } else {
                    whiteScore++;
                }
                
                // Highlight decisive goal in timeline
                if (index === AppState.currentGame.decisiveGoalIndex) {
                    item.classList.add('decisive-goal-item');
                }
                
                // Scorer is always valid (never NONE)
                const scorerName = AppState.players.find(p => p.id === goal.scorer)?.name || 'Unknown';
                const assistName = goal.assist === 'NONE' || !goal.assist
                    ? 'None' 
                    : AppState.players.find(p => p.id === goal.assist)?.name || 'Unknown';
                
                const teamLabel = getTeamNameShort(goal.team);
                
                // Add lightning bolt icon if this is the decisive goal
                const isDecisiveGoal = index === AppState.currentGame.decisiveGoalIndex;
                const decisiveIcon = isDecisiveGoal ? ' ⚡' : '';
                
                // Display score instead of "Goal X"
                const scoreDisplay = `${blackScore}-${whiteScore}`;
                
                item.innerHTML = `
                    <strong>${scoreDisplay}</strong> - ${teamLabel} team: 
                    ${escapeHtml(scorerName)}${decisiveIcon}${goal.assist && goal.assist !== 'NONE' ? ` (assist: ${escapeHtml(assistName)})` : ''}
                `;
                goalsTimeline.appendChild(item);
            });
        }
    }
}

function calculateMVPScore(player) {
    // MVP = Points + 3×(Points in Wins) + 2×DecisiveGoals + 1×DecisiveAssists
    return player.points + (3 * player.pointsInWins) + (2 * (player.decisiveGoals || 0)) + (1 * (player.decisiveAssists || 0));
}

function calculateMVP(players) {
    if (players.length === 0) return [];
    
    // Calculate MVP score for each player
    const mvpScores = players.map(player => ({
        id: player.id,
        score: calculateMVPScore(player),
        decisiveGoals: player.decisiveGoals,
        gamesWon: player.gamesWon,
        points: player.points,
        goals: player.goals,
        assists: player.assists
    }));
    
    // Find maximum MVP score
    const maxMVPScore = Math.max(...mvpScores.map(p => p.score));
    
    // Get all players with maximum MVP score
    let mvpCandidates = mvpScores.filter(p => p.score === maxMVPScore);
    
    // Apply tiebreaker logic if multiple candidates
    if (mvpCandidates.length > 1) {
        // Tiebreaker 1: More Decisive Goals
        const maxDecisiveGoals = Math.max(...mvpCandidates.map(p => p.decisiveGoals));
        mvpCandidates = mvpCandidates.filter(p => p.decisiveGoals === maxDecisiveGoals);
        
        if (mvpCandidates.length > 1) {
            // Tiebreaker 2: More Wins
            const maxWins = Math.max(...mvpCandidates.map(p => p.gamesWon));
            mvpCandidates = mvpCandidates.filter(p => p.gamesWon === maxWins);
            
            if (mvpCandidates.length > 1) {
                // Tiebreaker 3: More Points
                const maxPoints = Math.max(...mvpCandidates.map(p => p.points));
                mvpCandidates = mvpCandidates.filter(p => p.points === maxPoints);
            }
            if (mvpCandidates.length > 1) {
                // Tiebreaker 4: More Goals
                const maxGoals = Math.max(...mvpCandidates.map(p => p.goals));
                mvpCandidates = mvpCandidates.filter(p => p.goals === maxGoals);
            }
            if (mvpCandidates.length > 1) {
                // Tiebreaker 5: More Assists
                const maxAssists = Math.max(...mvpCandidates.map(p => p.assists));
                mvpCandidates = mvpCandidates.filter(p => p.assists === maxAssists);
            }
            if (mvpCandidates.length > 1) {
                // Tiebreaker 6: Player id (deterministic, always resolves to one)
                mvpCandidates = [...mvpCandidates].sort((a, b) => a.id.localeCompare(b.id));
                mvpCandidates = [mvpCandidates[0]];
            }
        }
    }
    
    // Return single winner (array of one ID, or empty)
    return mvpCandidates.length > 0 ? [mvpCandidates[0].id] : [];
}

function calculateBestDefenderScores(players, gameHistory, settings) {
    const scoresByPlayer = {};
    players.forEach(player => {
        scoresByPlayer[player.id] = [];
    });
    
    if (!Array.isArray(gameHistory) || gameHistory.length === 0) {
        return scoresByPlayer;
    }
    
    const goalsToWinCfg = settings && settings.maxScoreEnabled
        ? (settings.maxScore || 5)
        : 5;
    
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    
    gameHistory.forEach(game => {
        if (!game || !Array.isArray(game.blackTeam) || !Array.isArray(game.whiteTeam)) {
            return;
        }
        
        const blackScore = typeof game.blackScore === 'number' ? game.blackScore : 0;
        const whiteScore = typeof game.whiteScore === 'number' ? game.whiteScore : 0;
        
        const blackGA = whiteScore;
        const whiteGA = blackScore;
        
        const blackWon = blackScore > whiteScore;
        const whiteWon = whiteScore > blackScore;
        
        const defBaseBlack = clamp((goalsToWinCfg - blackGA) / goalsToWinCfg, -0.5, 1);
        const defBaseWhite = clamp((goalsToWinCfg - whiteGA) / goalsToWinCfg, -0.5, 1);
        
        const blackMatchScore = defBaseBlack + (blackWon ? 0.15 : 0);
        const whiteMatchScore = defBaseWhite + (whiteWon ? 0.15 : 0);
        
        game.blackTeam.forEach(playerObj => {
            if (playerObj && scoresByPlayer[playerObj.id]) {
                scoresByPlayer[playerObj.id].push(blackMatchScore);
            }
        });
        
        game.whiteTeam.forEach(playerObj => {
            if (playerObj && scoresByPlayer[playerObj.id]) {
                scoresByPlayer[playerObj.id].push(whiteMatchScore);
            }
        });
    });
    
    // Convert arrays to aggregated scores
    const result = {};
    players.forEach(player => {
        const scores = scoresByPlayer[player.id];
        if (!scores || scores.length === 0) {
            result[player.id] = null;
            return;
        }
        const defAvg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
        const pointsPerMatch = player.gamesPlayed > 0 ? (player.points / player.gamesPlayed) : 0;
        const attackPenalty = 0.05 * Math.min(pointsPerMatch, 3);
        const defFinal = defAvg - attackPenalty;
        result[player.id] = { defAvg, pointsPerMatch, defFinal };
    });
    
    return result;
}

function calculateBestDefenderWinners(players, gameHistory, settings) {
    if (!players || players.length === 0) return [];
    
    const mvpIds = calculateMVP(players);
    const scores = calculateBestDefenderScores(players, gameHistory || [], settings || {});
    
    const eligible = players.filter(player => {
        if (player.gamesPlayed < 3) return false;
        if (mvpIds.includes(player.id)) return false;
        const scoreEntry = scores[player.id];
        return scoreEntry && isFinite(scoreEntry.defFinal);
    });
    
    if (eligible.length === 0) return [];
    
    let maxDefFinal = -Infinity;
    eligible.forEach(player => {
        const scoreEntry = scores[player.id];
        if (scoreEntry.defFinal > maxDefFinal) {
            maxDefFinal = scoreEntry.defFinal;
        }
    });
    
    // Single winner with deterministic tiebreaker on id if needed
    const topCandidates = eligible.filter(player => scores[player.id].defFinal === maxDefFinal);
    if (topCandidates.length === 0) return [];
    
    topCandidates.sort((a, b) => a.id.localeCompare(b.id));
    return [topCandidates[0].id];
}

function calculateBestKeeperWinners(goalkeepers) {
    if (!goalkeepers || goalkeepers.length === 0) return [];

    const eligible = goalkeepers.filter(gk => (gk.gamesAsGK || 0) >= 3);
    if (eligible.length === 0) return [];

    const scored = eligible.map(gk => {
        const games = gk.gamesAsGK || 0;
        const goalsConceded = gk.goalsConceded || 0;
        const cleanSheets = gk.cleanSheets || 0;
        const winsAsGK = gk.winsAsGK || 0;
        const gcPerGame = games > 0 ? goalsConceded / games : Number.POSITIVE_INFINITY;
        return {
            id: gk.id,
            cleanSheets,
            gcPerGame,
            winsAsGK
        };
    });

    scored.sort((a, b) => {
        if (b.winsAsGK !== a.winsAsGK) return b.winsAsGK - a.winsAsGK;
        if (a.gcPerGame !== b.gcPerGame) return a.gcPerGame - b.gcPerGame;
        if (b.cleanSheets !== a.cleanSheets) return b.cleanSheets - a.cleanSheets;
        return a.id.localeCompare(b.id);
    });

    const best = scored[0];
    if (!best) return [];

    return scored
        .filter(s => s.winsAsGK === best.winsAsGK &&
                     s.gcPerGame === best.gcPerGame &&
                     s.cleanSheets === best.cleanSheets)
        .map(s => s.id);
}

function calculateAwards(players) {
    if (players.length === 0) return {};
    
    const awards = {};
    
    // Initialize awards object for all players
    players.forEach(player => {
        awards[player.id] = [];
    });
    
    // Find maximum and minimum values
    const maxWins = Math.max(...players.map(p => p.gamesWon));
    const maxPoints = Math.max(...players.map(p => p.points));
    const maxGoals = Math.max(...players.map(p => p.goals));
    const maxAssists = Math.max(...players.map(p => p.assists));
    const minWins = Math.min(...players.map(p => p.gamesWon));
    
    // Award crowns for most wins
    players.forEach(player => {
        if (player.gamesWon === maxWins && maxWins > 0) {
            awards[player.id].push('crown');
        }
    });
    
    // Award star for most points
    players.forEach(player => {
        if (player.points === maxPoints && maxPoints > 0) {
            awards[player.id].push('star');
        }
    });
    
    // Award bullseye for most goals
    players.forEach(player => {
        if (player.goals === maxGoals && maxGoals > 0) {
            awards[player.id].push('bullseye');
        }
    });
    
    // Award right-arrow for most assists
    players.forEach(player => {
        if (player.assists === maxAssists && maxAssists > 0) {
            awards[player.id].push('assist');
        }
    });
    
    // Award pig for least wins (only if pig award is enabled)
    // Only assign to ONE player based on: GW, Pts, G, A, MVP in that order
    if (AppState.settings.pigAwardEnabled) {
        // Find all players with least wins
        const playersWithLeastWins = players.filter(p => p.gamesWon === minWins);
        
        if (playersWithLeastWins.length > 0) {
            // Sort by tiebreaker criteria: GW (already filtered), then least Pts, then least G, then least A, then lowest MVP
            const sortedPigCandidates = [...playersWithLeastWins].sort((a, b) => {
                // First tiebreaker: Least Points (ascending)
                if (a.points !== b.points) return a.points - b.points;
                
                // Second tiebreaker: Least Goals (ascending)
                if (a.goals !== b.goals) return a.goals - b.goals;
                
                // Third tiebreaker: Least Assists (ascending)
                if (a.assists !== b.assists) return a.assists - b.assists;
                
                // Fourth tiebreaker: Lowest MVP score (ascending)
                const mvpA = calculateMVPScore(a);
                const mvpB = calculateMVPScore(b);
                return mvpA - mvpB;
            });
            
            // Award pig to the first player (worst performer by tiebreakers)
            awards[sortedPigCandidates[0].id].push('pig');
        }
    }
    
    // Award Best Defender (defensive performance, min 3 games, excludes MVP)
    const bestDefenderIds = calculateBestDefenderWinners(players, AppState.gameHistory || [], AppState.settings || {});
    bestDefenderIds.forEach(playerId => {
        if (awards[playerId]) {
            awards[playerId].push('best_def');
        }
    });
    
    // Award lightning bolt for MVP (highest MVP score)
    const mvpPlayerIds = calculateMVP(players);
    mvpPlayerIds.forEach(playerId => {
        awards[playerId].push('mvp');
    });
    
    // Add hattrick icons to awards column (last)
    players.forEach(player => {
        if (player.hattricks === 1) {
            awards[player.id].push('hat');
        } else if (player.hattricks >= 2) {
            const hatNumber = Math.min(player.hattricks, 9);
            awards[player.id].push(`hat_${hatNumber}`);
        }
    });
    
    return awards;
}

function getAwardIconHTML(iconId) {
    const svgIcons = {
        'crown': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="badgeOuter" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#FFF2A6"/>
      <stop offset="1" stop-color="#C98A00"/>
    </radialGradient>
    <radialGradient id="badgeInner" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#FFE27A"/>
      <stop offset="1" stop-color="#B87400"/>
    </radialGradient>
    <pattern id="dither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
    </pattern>
    <linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFE27A"/>
      <stop offset="1" stop-color="#C98A00"/>
    </linearGradient>
    <linearGradient id="crownHighlight" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF7C8"/>
      <stop offset="1" stop-color="#E2B14A"/>
    </linearGradient>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#badgeOuter)" stroke="#1A1200" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#badgeInner)" stroke="#1A1200" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#dither)"/>
  <path d="M8 20
           L10 12
           L16 16
           L22 12
           L24 20
           Z"
        fill="url(#crownGold)" stroke="#1A1200" stroke-width="1" stroke-linejoin="miter"/>
  <path d="M12 20
           L16 10
           L20 20
           Z"
        fill="url(#crownGold)" stroke="#1A1200" stroke-width="1" stroke-linejoin="miter"/>
  <rect x="8" y="20" width="16" height="5"
        fill="url(#crownGold)" stroke="#1A1200" stroke-width="1"/>
  <rect x="10" y="21" width="1" height="3" fill="#FFFFFF" opacity="0.40"/>
  <rect x="15" y="12" width="1" height="2" fill="#FFFFFF" opacity="0.55"/>
  <rect x="21" y="21" width="1" height="3" fill="#FFFFFF" opacity="0.25"/>
  <rect x="11" y="22" width="2" height="2" fill="#39A0FF" stroke="#1A1200" stroke-width="1"/>
  <rect x="15" y="22" width="2" height="2" fill="#FF4D6D" stroke="#1A1200" stroke-width="1"/>
  <rect x="19" y="22" width="2" height="2" fill="#3DFF6F" stroke="#1A1200" stroke-width="1"/>
</svg>`,
        'star': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="starBadgeOuter" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#E6A052"/>
      <stop offset="1" stop-color="#8B4513"/>
    </radialGradient>
    <radialGradient id="starBadgeInner" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#CD7F32"/>
      <stop offset="1" stop-color="#A0522D"/>
    </radialGradient>
    <linearGradient id="starBronze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#CD7F32"/>
      <stop offset="1" stop-color="#8B4513"/>
    </linearGradient>
    <linearGradient id="starBronzeHighlight" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E6A052"/>
      <stop offset="1" stop-color="#A0522D"/>
    </linearGradient>
    <pattern id="starDither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
    </pattern>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#starBadgeOuter)" stroke="#5A3A1A" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#starBadgeInner)" stroke="#5A3A1A" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#starDither)"/>
  <!-- 5-pointed star -->
  <path d="M16 8 L17.5 13 L23 13 L18.5 16.5 L20 22 L16 18.5 L12 22 L13.5 16.5 L9 13 L14.5 13 Z" fill="url(#starBronze)" stroke="#5A3A1A" stroke-width="1" stroke-linejoin="miter"/>
  <!-- Star highlight -->
  <path d="M16 8 L17.5 13 L18.5 16.5 L16 18.5 L13.5 16.5 L14.5 13 Z" fill="url(#starBronzeHighlight)" opacity="0.7"/>
  <!-- PT text -->
  <text x="16" y="20" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="7" font-weight="900" letter-spacing="0.5" fill="#5A3A1A">PT</text>
  <text x="16" y="20" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="7" font-weight="900" letter-spacing="0.5" fill="#FFFFFF">PT</text>
  <!-- Shine -->
  <rect x="12" y="10" width="1" height="3" fill="#FFFFFF" opacity="0.55"/>
</svg>`,
        'bullseye': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="redBadgeOuter" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#FF6B6B"/>
      <stop offset="1" stop-color="#CC0000"/>
    </radialGradient>
    <radialGradient id="redBadgeInner" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#FF4D4D"/>
      <stop offset="1" stop-color="#990000"/>
    </radialGradient>
    <linearGradient id="ringRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FF6B6B"/>
      <stop offset="1" stop-color="#CC0000"/>
    </linearGradient>
    <linearGradient id="ringWhite" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#DADADA"/>
    </linearGradient>
    <linearGradient id="ringDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2B0000"/>
      <stop offset="1" stop-color="#0A0000"/>
    </linearGradient>
    <pattern id="redDither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
    </pattern>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#redBadgeOuter)" stroke="#8B0000" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#redBadgeInner)" stroke="#8B0000" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#redDither)"/>
  <circle cx="16" cy="16" r="8" fill="url(#ringWhite)" stroke="#8B0000" stroke-width="1"/>
  <circle cx="16" cy="16" r="6" fill="url(#ringRed)" stroke="#8B0000" stroke-width="1"/>
  <circle cx="16" cy="16" r="4" fill="url(#ringWhite)" stroke="#8B0000" stroke-width="1"/>
  <circle cx="16" cy="16" r="3" fill="url(#ringDark)" stroke="#8B0000" stroke-width="1"/>
  <g transform="translate(12,11)">
    <rect x="0" y="0" width="10" height="2" fill="#8B0000"/>
    <rect x="0" y="0" width="2" height="12" fill="#8B0000"/>
    <rect x="0" y="10" width="10" height="2" fill="#8B0000"/>
    <rect x="8" y="6" width="2" height="6" fill="#8B0000"/>
    <rect x="4" y="6" width="6" height="2" fill="#8B0000"/>
  </g>
  <g transform="translate(13,12)">
    <rect x="0" y="0" width="8" height="2" fill="#FFFFFF"/>
    <rect x="0" y="0" width="2" height="10" fill="#FFFFFF"/>
    <rect x="0" y="8" width="8" height="2" fill="#FFFFFF"/>
    <rect x="6" y="4" width="2" height="6" fill="#FFFFFF"/>
    <rect x="3" y="4" width="5" height="2" fill="#FFFFFF"/>
  </g>
  <rect x="12" y="10" width="1" height="3" fill="#FFFFFF" opacity="0.55"/>
        </svg>`,
        'best_def': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="defBadgeOuter" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#F0F4FF"/>
      <stop offset="1" stop-color="#7A828C"/>
    </radialGradient>
    <radialGradient id="defBadgeInner" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#D0D6E0"/>
      <stop offset="1" stop-color="#555B66"/>
    </radialGradient>
    <linearGradient id="defShield" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F5F7FA"/>
      <stop offset="1" stop-color="#A0A6B2"/>
    </linearGradient>
    <linearGradient id="defShieldEdge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#C0C6D0"/>
    </linearGradient>
    <pattern id="defDither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.08"/>
    </pattern>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#defBadgeOuter)" stroke="#1A1C22" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#defBadgeInner)" stroke="#1A1C22" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#defDither)"/>
  <path d="M10 9
           L22 9
           L22 15
           C22 19 19.5 21.5 16 23
           C12.5 21.5 10 19 10 15
           Z"
        fill="url(#defShield)" stroke="#1A1C22" stroke-width="1" stroke-linejoin="miter"/>
  <path d="M11 10
           L21 10
           L21 15
           C21 18.3 19.1 20.4 16 21.8
           C12.9 20.4 11 18.3 11 15
           Z"
        fill="url(#defShieldEdge)" opacity="0.85"/>
  <text x="16" y="17"
        text-anchor="middle"
        font-family="Verdana, Arial, sans-serif"
        font-size="8"
        font-weight="900"
        letter-spacing="0.5"
        fill="#1A1C22">D</text>
  <text x="16" y="17"
        text-anchor="middle"
        font-family="Verdana, Arial, sans-serif"
        font-size="8"
        font-weight="900"
        letter-spacing="0.5"
        fill="#FFFFFF" opacity="0.9">D</text>
</svg>`,
        'best_gk': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="gkBadgeOuter" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#B0B0B0"/>
    </radialGradient>
    <radialGradient id="gkBadgeInner" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#E8E8E8"/>
      <stop offset="1" stop-color="#7A7A7A"/>
    </radialGradient>
    <linearGradient id="gkMask" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#C0C0C0"/>
    </linearGradient>
    <pattern id="gkDither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.12"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.08"/>
    </pattern>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#gkBadgeOuter)" stroke="#1A1A1A" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#gkBadgeInner)" stroke="#1A1A1A" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#gkDither)"/>
  <!-- Mask outline -->
  <path d="M10 9
           L22 9
           L22 17
           C22 20 19.5 22 16 23
           C12.5 22 10 20 10 17
           Z"
        fill="url(#gkMask)" stroke="#1A1A1A" stroke-width="1" stroke-linejoin="miter"/>
  <!-- Eye holes -->
  <rect x="12" y="13" width="3" height="2" fill="#1A1A1A"/>
  <rect x="17" y="13" width="3" height="2" fill="#1A1A1A"/>
  <!-- Vertical mask stitches -->
  <rect x="15" y="10" width="1" height="3" fill="#1A1A1A" opacity="0.8"/>
  <rect x="13" y="11" width="1" height="2" fill="#1A1A1A" opacity="0.6"/>
  <rect x="19" y="11" width="1" height="2" fill="#1A1A1A" opacity="0.6"/>
  <!-- Horizontal claw-like slashes -->
  <rect x="11" y="18" width="4" height="1" fill="#8B0000" opacity="0.9"/>
  <rect x="13" y="19" width="4" height="1" fill="#8B0000" opacity="0.8"/>
  <rect x="15" y="20" width="4" height="1" fill="#8B0000" opacity="0.7"/>
</svg>`,
        'assist': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="greenBadgeOuter" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#66FF66"/>
      <stop offset="1" stop-color="#00A86B"/>
    </radialGradient>
    <radialGradient id="greenBadgeInner" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#3DFFB2"/>
      <stop offset="1" stop-color="#007A8A"/>
    </radialGradient>
    <linearGradient id="handGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#66FF66"/>
      <stop offset="1" stop-color="#00CC00"/>
    </linearGradient>
    <linearGradient id="handGreenShade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7FFF7F"/>
      <stop offset="1" stop-color="#00AA00"/>
    </linearGradient>
    <pattern id="greenDither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
    </pattern>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#greenBadgeOuter)" stroke="#004400" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#greenBadgeInner)" stroke="#004400" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#greenDither)"/>
  <g transform="rotate(90 16 16) translate(-2 0)">
    <path d="M11 14
             C11 12, 13 11, 15 11
             H17
             C19 11, 21 12, 21 14
             V20
             C21 22, 19 24, 16 24
             C13 24, 11 22, 11 20 Z"
          fill="url(#handGreen)" stroke="#004400" stroke-width="1"/>
    <rect x="12" y="9" width="2" height="5" fill="url(#handGreenShade)" stroke="#004400" stroke-width="1"/>
    <rect x="14" y="8" width="2" height="6" fill="url(#handGreenShade)" stroke="#004400" stroke-width="1"/>
    <rect x="16" y="8" width="2" height="6" fill="url(#handGreenShade)" stroke="#004400" stroke-width="1"/>
    <rect x="18" y="9" width="2" height="5" fill="url(#handGreenShade)" stroke="#004400" stroke-width="1"/>
    <path d="M10 16 C9 16, 9 18, 10 19 L11 20 V16 Z"
          fill="url(#handGreenShade)" stroke="#004400" stroke-width="1"/>
  </g>
  <text x="16" y="21"
        text-anchor="middle"
        font-family="Verdana, Arial, sans-serif"
        font-size="10"
        font-weight="900"
        fill="#004400">A</text>
  <text x="16" y="21"
        text-anchor="middle"
        font-family="Verdana, Arial, sans-serif"
        font-size="10"
        font-weight="900"
        fill="#FFFFFF">A</text>
  <rect x="12" y="12" width="1" height="3" fill="#FFFFFF" opacity="0.45"/>
</svg>`,
        'pig': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="badgeOuter" cx="30%" cy="25%" r="80%">
      <stop offset="0" stop-color="#FFB3D9"/>
      <stop offset="1" stop-color="#FF6AD5"/>
    </radialGradient>
    <radialGradient id="badgeInner" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="#FF9CCE"/>
      <stop offset="1" stop-color="#FF2E6E"/>
    </radialGradient>
    <pattern id="dither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
    </pattern>
    <radialGradient id="pigFace" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="#FFD0DA"/>
      <stop offset="1" stop-color="#FF7FA0"/>
    </radialGradient>
    <radialGradient id="snout" cx="40%" cy="35%" r="80%">
      <stop offset="0" stop-color="#FFB2C4"/>
      <stop offset="1" stop-color="#FF6C8E"/>
    </radialGradient>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#badgeOuter)" stroke="#0B001A" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#badgeInner)" stroke="#0B001A" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#dither)"/>
  <circle cx="16" cy="17" r="9" fill="url(#pigFace)" stroke="#0B001A" stroke-width="1"/>
  <path d="M10 10l-3-2 1 5" fill="#FF9CB3" stroke="#0B001A" stroke-width="1" stroke-linejoin="miter"/>
  <path d="M22 10l3-2-1 5" fill="#FF9CB3" stroke="#0B001A" stroke-width="1" stroke-linejoin="miter"/>
  <rect x="12" y="15" width="2" height="2" fill="#0B001A"/>
  <rect x="18" y="15" width="2" height="2" fill="#0B001A"/>
  <ellipse cx="16" cy="20" rx="6" ry="4" fill="url(#snout)" stroke="#0B001A" stroke-width="1"/>
  <rect x="13" y="19" width="2" height="2" fill="#0B001A" opacity="0.85"/>
  <rect x="17" y="19" width="2" height="2" fill="#0B001A" opacity="0.85"/>
  <rect x="12" y="12" width="1" height="4" fill="#FFFFFF" opacity="0.6"/>
  <rect x="13" y="12" width="1" height="2" fill="#FFFFFF" opacity="0.35"/>
</svg>`,
        'mvp': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="blueBadgeOuter" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#66B3FF"/>
      <stop offset="1" stop-color="#0066CC"/>
    </radialGradient>
    <radialGradient id="blueBadgeInner" cx="35%" cy="30%" r="85%">
      <stop offset="0" stop-color="#4DA3FF"/>
      <stop offset="1" stop-color="#0052A3"/>
    </radialGradient>
    <linearGradient id="boltBlue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#99CCFF"/>
      <stop offset="1" stop-color="#0088FF"/>
    </linearGradient>
    <linearGradient id="boltBlueHighlight" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#B3D9FF"/>
      <stop offset="1" stop-color="#3399FF"/>
    </linearGradient>
    <pattern id="blueDither" width="2" height="2" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="none"/>
      <rect x="0" y="0" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
      <rect x="1" y="1" width="1" height="1" fill="#FFFFFF" opacity="0.10"/>
    </pattern>
    <filter id="glowBlue" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="0.6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#blueBadgeOuter)" stroke="#003366" stroke-width="2"/>
  <circle cx="16" cy="16" r="12" fill="url(#blueBadgeInner)" stroke="#003366" stroke-width="1"/>
  <circle cx="16" cy="16" r="12" fill="url(#blueDither)"/>
  <path
    d="M18 6 L10 18 H15 L13 26 L22 13 H17 Z"
    fill="url(#boltBlue)"
    stroke="#003366"
    stroke-width="1"
    stroke-linejoin="miter"
    filter="url(#glowBlue)"
  />
  <path
    d="M18 6 L10 18 H15 L13 20 L18 10 H17 Z"
    fill="url(#boltBlueHighlight)"
    opacity="0.6"
  />
  <text x="16" y="22"
        text-anchor="middle"
        font-family="Verdana, Arial, sans-serif"
        font-size="7"
        font-weight="900"
        letter-spacing="0.5"
        fill="#003366">MVP</text>
  <text x="16" y="22"
        text-anchor="middle"
        font-family="Verdana, Arial, sans-serif"
        font-size="7"
        font-weight="900"
        letter-spacing="0.5"
        fill="#FFFFFF">MVP</text>
</svg>`,
        'hat': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <!-- Top hat brim -->
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack)" stroke="#0A0A0A" stroke-width="1"/>
  <!-- Top hat crown -->
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack)" stroke="#0A0A0A" stroke-width="1"/>
  <!-- Hat band -->
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand)" stroke="#0A0A0A" stroke-width="1"/>
  <!-- Shine -->
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
</svg>`,
        'hat_2': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack2)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack2)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand2)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">2</text>
</svg>`,
        'hat_3': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack3)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack3)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand3)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">3</text>
</svg>`,
        'hat_4': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack4" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand4" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack4)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack4)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand4)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">4</text>
</svg>`,
        'hat_5': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack5" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand5" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack5)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack5)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand5)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">5</text>
</svg>`,
        'hat_6': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack6" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand6" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack6)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack6)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand6)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">6</text>
</svg>`,
        'hat_7': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack7" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand7" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack7)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack7)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand7)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">7</text>
</svg>`,
        'hat_8': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack8" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand8" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack8)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack8)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand8)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">8</text>
</svg>`,
        'hat_9': `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="hatBlack9" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4A4A4A"/>
      <stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
    <linearGradient id="hatBand9" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#D0D0D0"/>
    </linearGradient>
  </defs>
  <rect x="6" y="20" width="20" height="3" fill="url(#hatBlack9)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="8" width="12" height="13" fill="url(#hatBlack9)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="10" y="18" width="12" height="2" fill="url(#hatBand9)" stroke="#0A0A0A" stroke-width="1"/>
  <rect x="11" y="9" width="1" height="9" fill="#FFFFFF" opacity="0.3"/>
  <text x="16" y="16" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="8" font-weight="900" fill="#FFFFFF">9</text>
</svg>`
    };
    
    const iconContent = svgIcons[iconId];
    if (!iconContent) {
        // Icon not found - return empty string or placeholder
        console.warn(`Icon not found: ${iconId}`);
        return '';
    }
    
    // All icons are now SVGs
    return `<span class="award-icon award-icon-svg">${iconContent}</span>`;
}

function renderTodaysStats() {
    const tbody = document.getElementById('full-standings-body');
    if (!tbody) return;
    
    const table = tbody.closest('table');
    if (table) table.style.fontSize = '';

    const view = AppState.todaysStatsView || 'field';
    const plusMinusActive = isPlusMinusActiveForSession();

    // Update header based on view
    if (table) {
        const thead = table.querySelector('thead');
        if (thead) {
            if (view === 'field') {
                thead.innerHTML = `
                    <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Awards</th>
                        <th>GW/GP</th>
                        <th>Pts</th>
                        <th>G</th>
                        <th>A</th>
                        ${plusMinusActive ? '<th>+/−</th>' : ''}
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr>
                        <th>Rank</th>
                        <th>Goalkeeper</th>
                        <th>Awards</th>
                        <th>GW/GP</th>
                        <th>GA</th>
                        <th>CS</th>
                    </tr>
                `;
            }
        }
    }

    tbody.innerHTML = '';

    if (view === 'field') {
        const sortedPlayers = [...AppState.players].sort(sortPlayers);
        const awards = calculateAwards(sortedPlayers);

        sortedPlayers.forEach((player, index) => {
            const row = document.createElement('tr');

            const rank = index + 1;
            const playerAwards = awards[player.id] || [];
            const awardsDisplay = playerAwards.map(iconId => getAwardIconHTML(iconId)).join(' ');

            const plusMinusCell = plusMinusActive ? `<td>${typeof player.plusMinus === 'number' ? player.plusMinus : 0}</td>` : '';
            row.innerHTML = `
                <td>${rank}</td>
                <td>${escapeHtml(player.name)}</td>
                <td class="awards-cell">${awardsDisplay}</td>
                <td>${player.gamesWon}/${player.gamesPlayed}</td>
                <td>${player.points}</td>
                <td>${player.goals}</td>
                <td>${player.assists}</td>
                ${plusMinusCell}
            `;
            tbody.appendChild(row);
        });
    } else {
        const gks = AppState.goalkeepers || [];
        if (!AppState.settings.goalkeepersEnabled || gks.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6">No goalkeeper stats available.</td>`;
            tbody.appendChild(row);
        } else {
            const sortedKeepers = [...gks].sort((a, b) => {
                const aGames = a.gamesAsGK || 0;
                const bGames = b.gamesAsGK || 0;
                const aWins = a.winsAsGK || 0;
                const bWins = b.winsAsGK || 0;
                const aGCPerGame = aGames > 0 ? (a.goalsConceded || 0) / aGames : Number.POSITIVE_INFINITY;
                const bGCPerGame = bGames > 0 ? (b.goalsConceded || 0) / bGames : Number.POSITIVE_INFINITY;
                const aCS = a.cleanSheets || 0;
                const bCS = b.cleanSheets || 0;
                if (bWins !== aWins) return bWins - aWins;
                if (aGCPerGame !== bGCPerGame) return aGCPerGame - bGCPerGame;
                if (bCS !== aCS) return bCS - aCS;
                return a.name.localeCompare(b.name);
            });

            const bestIds = new Set(calculateBestKeeperWinners(gks));

            sortedKeepers.forEach((gk, index) => {
                const row = document.createElement('tr');
                const rank = index + 1;
                const awardsDisplay = bestIds.has(gk.id) ? getAwardIconHTML('best_gk') : '';
                const games = gk.gamesAsGK || 0;
                const winsAsGK = gk.winsAsGK || 0;
                const goalsConceded = gk.goalsConceded || 0;
                const cleanSheets = gk.cleanSheets || 0;

                row.innerHTML = `
                    <td>${rank}</td>
                    <td>${escapeHtml(gk.name)}</td>
                    <td class="awards-cell">${awardsDisplay}</td>
                    <td>${winsAsGK}/${games}</td>
                    <td>${goalsConceded}</td>
                    <td>${cleanSheets}</td>
                `;
                tbody.appendChild(row);
            });
        }
    }
    
    // Wins per team (from completed games in this session)
    let blackWins = 0;
    let whiteWins = 0;
    (AppState.gameHistory || []).forEach(game => {
        if (game.blackScore > game.whiteScore) blackWins++;
        else if (game.whiteScore > game.blackScore) whiteWins++;
    });
    const teamWinsEl = document.getElementById('team-wins-summary');
    if (teamWinsEl) {
        const blackName = getTeamName('black');
        const whiteName = getTeamName('white');
        const blackColorKey = getTeamColorKey(blackName);
        const whiteColorKey = getTeamColorKey(whiteName);
        teamWinsEl.innerHTML = `<span data-team-color="${escapeHtml(blackColorKey)}">${escapeHtml(blackName)} ${blackWins}</span> – <span data-team-color="${escapeHtml(whiteColorKey)}">${escapeHtml(whiteName)} ${whiteWins}</span>`;
    }
    
    // Update GK stats button visibility and label
    const gkBtn = document.getElementById('view-gk-stats-btn');
    if (gkBtn) {
        const hasGKData = AppState.settings.goalkeepersEnabled && (AppState.goalkeepers || []).length > 0;
        gkBtn.style.display = hasGKData ? 'inline-block' : 'none';
        if (!hasGKData) {
            AppState.todaysStatsView = 'field';
        }
        gkBtn.textContent = AppState.todaysStatsView === 'gk' ? 'View field stats' : 'View GK stats';
    }

    // Font size is adjusted in showScreen() when todays-stats is activated so container has real dimensions
}

function exportTodaysStatsPng() {
    if (typeof window.html2canvas === 'undefined') {
        alert('Export library did not load. Check your connection and try again.');
        return;
    }
    const el = document.getElementById('todays-stats-export-area');
    if (!el) return;
    window.html2canvas(el, {
        backgroundColor: '#606060',
        scale: 2,
        useCORS: true,
        logging: false
    }).then(canvas => {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `TavelPlay-Stats-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
    }).catch(err => {
        console.error(err);
        alert('Export failed. Try again.');
    });
}

function adjustStatsFontSize() {
    const container = document.querySelector('.full-standings-container');
    const table = document.querySelector('.full-standings-table');
    if (!container || !table) return;
    
    const containerHeight = container.clientHeight;
    const tableHeight = table.scrollHeight;
    const currentFontSize = parseInt(window.getComputedStyle(table).fontSize);
    
    if (tableHeight > containerHeight && currentFontSize > 12) {
        const newFontSize = Math.max(12, currentFontSize - 2);
        table.style.fontSize = `${newFontSize}px`;
        // Recursively adjust if still too large
        setTimeout(() => adjustStatsFontSize(), 10);
    }
}

function adjustTeamSelectionFontSize() {
    const screen = document.getElementById('screen-team-selection');
    const teamsContainer = document.querySelector('.teams-container');
    const blackTeamPlayers = document.getElementById('black-team-players');
    const whiteTeamPlayers = document.getElementById('white-team-players');
    
    if (!screen || !teamsContainer || !blackTeamPlayers || !whiteTeamPlayers) return;
    
    // Get available height (viewport height minus header, footer, padding)
    const viewportHeight = window.innerHeight;
    const screenHeader = screen.querySelector('h1');
    const screenFooter = screen.querySelector('.screen-footer');
    const headerHeight = screenHeader ? screenHeader.offsetHeight : 0;
    const footerHeight = screenFooter ? screenFooter.offsetHeight : 0;
    const mainContentPadding = 30 * 2; // top and bottom padding of main-content
    const teamsContainerGap = 30; // gap between teams
    const teamSectionPadding = 30 * 2; // top and bottom padding of team-section
    const teamSectionH2 = teamsContainer.querySelector('.team-section h2');
    const h2Height = teamSectionH2 ? teamSectionH2.offsetHeight + 30 : 0; // h2 height + margin-bottom
    
    const availableHeight = viewportHeight - headerHeight - footerHeight - mainContentPadding - h2Height - teamSectionPadding;
    
    // Get the taller of the two teams
    const blackHeight = blackTeamPlayers.scrollHeight;
    const whiteHeight = whiteTeamPlayers.scrollHeight;
    const maxHeight = Math.max(blackHeight, whiteHeight);
    
    // Get current font size
    const playerNameElements = blackTeamPlayers.querySelectorAll('.team-player-name');
    if (playerNameElements.length === 0) return;
    
    const currentFontSize = parseInt(window.getComputedStyle(playerNameElements[0]).fontSize);
    const minFontSize = 18;
    
    // If content exceeds available height, reduce font sizes
    if (maxHeight > availableHeight && currentFontSize > minFontSize) {
        const newFontSize = Math.max(minFontSize, currentFontSize - 2);
        
        // Apply new font size to all player names in both teams
        const allPlayerNames = document.querySelectorAll('.team-player-name');
        allPlayerNames.forEach(el => {
            el.style.fontSize = `${newFontSize}px`;
        });
        
        // Recursively adjust if still too large
        setTimeout(() => adjustTeamSelectionFontSize(), 10);
    }
}

function adjustGoalRegistrationFontSize() {
    const modalContent = document.querySelector('.modal-content');
    const goalRegistrationList = document.querySelector('.goal-registration-list');
    if (!modalContent || !goalRegistrationList) return;
    
    // Get available height (viewport height minus modal padding and header/footer)
    const viewportHeight = window.innerHeight;
    const modalPadding = 40 * 2; // top and bottom padding
    const headerHeight = modalContent.querySelector('h2')?.offsetHeight || 0;
    const footerHeight = modalContent.querySelector('.modal-footer')?.offsetHeight || 0;
    const availableHeight = viewportHeight * 0.95 - modalPadding - headerHeight - footerHeight - 20; // 20px margin
    
    // Get current content height
    const contentHeight = goalRegistrationList.scrollHeight;
    
    // Get current font sizes
    const nameElements = goalRegistrationList.querySelectorAll('.goal-registration-item-name');
    const buttonElements = goalRegistrationList.querySelectorAll('.goal-btn-small, .assist-btn-small');
    
    if (nameElements.length === 0) return;
    
    const currentNameFontSize = parseInt(window.getComputedStyle(nameElements[0]).fontSize);
    const currentButtonFontSize = buttonElements.length > 0 
        ? parseInt(window.getComputedStyle(buttonElements[0]).fontSize) 
        : 18;
    
    // If content exceeds available height, reduce font sizes
    if (contentHeight > availableHeight) {
        const minNameFontSize = 16;
        const minButtonFontSize = 14;
        
        if (currentNameFontSize > minNameFontSize || currentButtonFontSize > minButtonFontSize) {
            // Reduce font sizes
            const newNameFontSize = Math.max(minNameFontSize, currentNameFontSize - 2);
            const newButtonFontSize = Math.max(minButtonFontSize, currentButtonFontSize - 2);
            
            // Apply new font sizes
            nameElements.forEach(el => {
                el.style.fontSize = `${newNameFontSize}px`;
            });
            
            buttonElements.forEach(el => {
                el.style.fontSize = `${newButtonFontSize}px`;
            });
            
            // Recursively adjust if still too large
            setTimeout(() => adjustGoalRegistrationFontSize(), 10);
        }
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Player Entries Screen
    const playerNameInput = document.getElementById('player-name-input');
    const addPlayerBtn = document.getElementById('add-player-btn');
    const recurringSelect = document.getElementById('recurring-player-select');
    const continueBtn = document.getElementById('continue-btn');
    
    if (addPlayerBtn) {
        addPlayerBtn.addEventListener('click', () => {
            const rawName = playerNameInput?.value || '';
            const name = rawName.trim();
            if (!name) return;

            const added = addPlayer(name);
            if (added && playerNameInput) {
                playerNameInput.value = '';
                playerNameInput.focus();
            }
        });
    }
    
    if (playerNameInput) {
        playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addPlayerBtn?.click();
            }
        });
    }

    if (recurringSelect) {
        recurringSelect.addEventListener('change', () => {
            const id = recurringSelect.value;
            if (!id) return;
            const rp = RecurringPlayers.find(p => p.id === id);
            if (!rp || !rp.name) return;

            if (addPlayer(rp.name)) {
                recurringSelect.value = '';
                renderRecurringPlayersDropdown();
            }
        });
    }
    
    // Remove player buttons (delegated)
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target || !target.classList) return;
        if (target.classList.contains('remove-player-btn')) {
            const playerId = target.getAttribute('data-player-id');
            if (playerId) removePlayer(playerId);
            return;
        }
        if (target.hasAttribute('data-recurring-id')) {
            const recurringId = target.getAttribute('data-recurring-id');
            if (recurringId) {
                RecurringPlayers = RecurringPlayers.filter(p => p.id !== recurringId);
                saveRecurringPlayers();
                renderSettings();
                renderRecurringPlayersDropdown();
            }
            return;
        }
    });
    
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            renderTeamSelection();
            showScreen('team-selection');
        });
    }
    
    // Settings view toggle buttons
    const settingsBtn = document.getElementById('settings-btn');
    const backFromSettingsBtn = document.getElementById('back-from-settings-btn');
    
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            showSettingsView();
        });
    }
    
    if (backFromSettingsBtn) {
        backFromSettingsBtn.addEventListener('click', () => {
            showPlayerEntriesView();
        });
    }
    
    const resetAllDataSettingsBtn = document.getElementById('reset-all-data-settings-btn');
    if (resetAllDataSettingsBtn) {
        resetAllDataSettingsBtn.addEventListener('click', () => {
            resetAllData();
            // After reset, show player entries view
            showPlayerEntriesView();
        });
    }
    
    // Settings Controls
    const assistsToggle = document.getElementById('setting-assists-enabled');
    const maxScoreToggle = document.getElementById('setting-max-score-enabled');
    const maxScoreSelector = document.getElementById('setting-max-score-value');
    const pigAwardToggle = document.getElementById('setting-pig-award-enabled');
    const goalkeepersToggle = document.getElementById('setting-goalkeepers-enabled');
    
    if (assistsToggle) {
        assistsToggle.addEventListener('change', () => {
            AppState.settings.assistsEnabled = assistsToggle.checked;
            saveSession();
            renderSettings();
        });
    }
    
    if (maxScoreToggle) {
        maxScoreToggle.addEventListener('change', () => {
            AppState.settings.maxScoreEnabled = maxScoreToggle.checked;
            saveSession();
            renderSettings();
        });
    }
    
    if (maxScoreSelector) {
        maxScoreSelector.addEventListener('change', () => {
            AppState.settings.maxScore = parseInt(maxScoreSelector.value, 10);
            saveSession();
            renderSettings();
            // Update goal buttons if game is in progress
            if (AppState.currentGame) {
                renderGameProgress();
            }
        });
    }
    
    if (pigAwardToggle) {
        pigAwardToggle.addEventListener('change', () => {
            // Invert logic: checked (YES) means disabled (false), unchecked (NO) means enabled (true)
            AppState.settings.pigAwardEnabled = !pigAwardToggle.checked;
            saveSession();
            renderSettings();
            // Update awards display if on Today's Stats screen
            if (AppState.currentScreen === 'todays-stats') {
                renderTodaysStats();
            }
        });
    }

    if (goalkeepersToggle) {
        goalkeepersToggle.addEventListener('change', () => {
            AppState.settings.goalkeepersEnabled = goalkeepersToggle.checked;
            saveSession();
            renderSettings();
            if (AppState.currentScreen === 'todays-stats') {
                renderTodaysStats();
            }
        });
    }
    
    // Random teams toggle
    const randomTeamsToggle = document.getElementById('setting-random-teams-enabled');
    if (randomTeamsToggle) {
        randomTeamsToggle.addEventListener('change', () => {
            AppState.settings.randomTeamsEnabled = randomTeamsToggle.checked;
            saveSession();
            renderSettings();
        });
    }

    // Starting lineup toggle and count
    const startingLineupToggle = document.getElementById('setting-starting-lineup-enabled');
    const startingLineupCountSelector = document.getElementById('setting-starting-lineup-count');
    if (startingLineupToggle) {
        startingLineupToggle.addEventListener('change', () => {
            AppState.settings.startingLineupEnabled = startingLineupToggle.checked;
            saveSession();
            renderSettings();
        });
    }
    if (startingLineupCountSelector) {
        startingLineupCountSelector.addEventListener('change', () => {
            AppState.settings.startingLineupCount = parseInt(startingLineupCountSelector.value, 10);
            saveSession();
            renderSettings();
        });
    }

    // Team name inputs
    const blackTeamNameInput = document.getElementById('setting-black-team-name');
    const whiteTeamNameInput = document.getElementById('setting-white-team-name');
    
    if (blackTeamNameInput) {
        blackTeamNameInput.addEventListener('change', () => {
            AppState.settings.blackTeamName = blackTeamNameInput.value;
            saveSession();
            renderSettings();
            applyTeamColors();
            if (AppState.currentScreen === 'team-selection' && AppState.currentTeams) {
                renderTeamDisplay(AppState.currentTeams);
            }
            if (AppState.currentScreen === 'game-progress' && AppState.currentGame) {
                renderGameProgress();
            }
            if (AppState.currentScreen === 'game-summary' && AppState.currentGame) {
                renderGameSummary();
            }
        });
    }

    // Goalkeeper list interactions
    const addGoalkeeperBtn = document.getElementById('add-goalkeeper-btn');
    const goalkeeperNameInput = document.getElementById('goalkeeper-name-input');
    const goalkeeperList = document.getElementById('goalkeeper-list');

    if (addGoalkeeperBtn && goalkeeperNameInput) {
        addGoalkeeperBtn.addEventListener('click', () => {
            if (addGoalkeeper(goalkeeperNameInput.value)) {
                goalkeeperNameInput.value = '';
                goalkeeperNameInput.focus();
            }
        });
        goalkeeperNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (addGoalkeeper(goalkeeperNameInput.value)) {
                    goalkeeperNameInput.value = '';
                }
            }
        });
    }

    if (goalkeeperList) {
        goalkeeperList.addEventListener('click', (e) => {
            const target = e.target;
            if (target && target.classList && target.classList.contains('remove-goalkeeper-btn') &&
                target.hasAttribute('data-goalkeeper-id')) {
                removeGoalkeeper(target.getAttribute('data-goalkeeper-id'));
            }
        });
    }

    const recurringManageToggleBtn = document.getElementById('recurring-manage-toggle-btn');
    if (recurringManageToggleBtn) {
        recurringManageToggleBtn.addEventListener('click', () => {
            recurringManageOpen = !recurringManageOpen;
            updateRecurringManageUI();
        });
    }

    const recurringPlayerNameInput = document.getElementById('recurring-player-name-input');
    const addRecurringPlayerBtn = document.getElementById('add-recurring-player-btn');
    if (addRecurringPlayerBtn && recurringPlayerNameInput) {
        addRecurringPlayerBtn.addEventListener('click', () => {
            if (addRecurringPlayerFromSettings(recurringPlayerNameInput.value)) {
                recurringPlayerNameInput.value = '';
                recurringPlayerNameInput.focus();
            }
        });
    }
    if (recurringPlayerNameInput) {
        recurringPlayerNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (addRecurringPlayerFromSettings(recurringPlayerNameInput.value)) {
                    recurringPlayerNameInput.value = '';
                }
            }
        });
    }
    
    if (whiteTeamNameInput) {
        whiteTeamNameInput.addEventListener('change', () => {
            AppState.settings.whiteTeamName = whiteTeamNameInput.value;
            saveSession();
            renderSettings();
            applyTeamColors();
            if (AppState.currentScreen === 'team-selection' && AppState.currentTeams) {
                renderTeamDisplay(AppState.currentTeams);
            }
            if (AppState.currentScreen === 'game-progress' && AppState.currentGame) {
                renderGameProgress();
            }
            if (AppState.currentScreen === 'game-summary' && AppState.currentGame) {
                renderGameSummary();
            }
        });
    }

    // Today's Stats GK view toggle
    const viewGkStatsBtn = document.getElementById('view-gk-stats-btn');
    if (viewGkStatsBtn) {
        viewGkStatsBtn.addEventListener('click', () => {
            if (!AppState.settings.goalkeepersEnabled || (AppState.goalkeepers || []).length === 0) {
                AppState.todaysStatsView = 'field';
            } else {
                AppState.todaysStatsView = AppState.todaysStatsView === 'gk' ? 'field' : 'gk';
            }
            renderTodaysStats();
        });
    }
    // Team Selection Screen
    const backToEntriesBtn = document.getElementById('back-to-entries-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const rematchBtn = document.getElementById('rematch-btn');
    const editTeamsBtn = document.getElementById('edit-teams-btn');
    
    if (backToEntriesBtn) {
        backToEntriesBtn.addEventListener('click', () => {
            // Reset edit mode when going back
            AppState.teamEditMode = false;
            showScreen('player-entries');
        });
    }
    
    if (rematchBtn) {
        rematchBtn.addEventListener('click', () => {
            restartStartGameCountdownIfNeeded();
            playRematch();
        });
    }
    
    if (editTeamsBtn) {
        editTeamsBtn.addEventListener('click', () => {
            restartStartGameCountdownIfNeeded();
            toggleTeamEditMode();
        });
    }
    
    const swapSidesBtn = document.getElementById('swap-sides-btn');
    if (swapSidesBtn) {
        swapSidesBtn.addEventListener('click', () => {
            restartStartGameCountdownIfNeeded();
            swapTeamSides();
        });
    }
    
    const backToGameBtn = document.getElementById('back-to-game-btn');
    if (backToGameBtn) {
        backToGameBtn.addEventListener('click', () => {
            clearTeamSelectionCountdown();
            clearStartGameCountdown();
            AppState.viewingTeamsFromGame = false;
            AppState.teamAddPlayerMode = false;
            AppState.teamRemovePlayerMode = false;
            showScreen('game-progress');
        });
    }

    const addPlayerDuringGameToggleBtn = document.getElementById('add-player-during-game-toggle-btn');
    if (addPlayerDuringGameToggleBtn) {
        addPlayerDuringGameToggleBtn.addEventListener('click', () => {
            toggleTeamAddPlayerMode();
        });
    }

    const removePlayerDuringGameToggleBtn = document.getElementById('remove-player-during-game-toggle-btn');
    if (removePlayerDuringGameToggleBtn) {
        removePlayerDuringGameToggleBtn.addEventListener('click', () => {
            toggleTeamRemovePlayerMode();
        });
    }
    
    // Move player buttons (delegated)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('move-player-btn')) {
            restartStartGameCountdownIfNeeded();
            const playerId = e.target.getAttribute('data-player-id');
            const fromTeam = e.target.getAttribute('data-from-team');
            const toTeam = e.target.getAttribute('data-to-team');
            if (playerId && fromTeam && toTeam) {
                movePlayerBetweenTeams(playerId, fromTeam, toTeam);
            }
        }
        if (e.target.classList.contains('remove-from-teams-btn')) {
            restartStartGameCountdownIfNeeded();
            const playerId = e.target.getAttribute('data-player-id');
            if (playerId && AppState.currentTeams) {
                const player = AppState.players.find(p => p.id === playerId);
                const playerName = player ? player.name : 'this player';
                if (!confirm(`Remove ${playerName} from the game? They will be removed from this match and from team selection.`)) {
                    return;
                }
                removePlayer(playerId);
                AppState.currentTeams.blackTeam = AppState.currentTeams.blackTeam.filter(p => p.id !== playerId);
                AppState.currentTeams.whiteTeam = AppState.currentTeams.whiteTeam.filter(p => p.id !== playerId);
                renderTeamDisplay(AppState.currentTeams);
            }
        }
        if (e.target.classList.contains('add-player-during-game-btn')) {
            const teamSide = e.target.getAttribute('data-team-side');
            if (teamSide) handleAddPlayerDuringGame(teamSide);
        }
        if (e.target.classList.contains('remove-during-game-btn')) {
            const playerId = e.target.getAttribute('data-player-id');
            if (playerId) removePlayerFromTeamDuringGame(playerId);
        }
    });

    document.addEventListener('change', (e) => {
        if (!e.target.classList.contains('add-player-during-game-select')) return;
        const teamSide = e.target.getAttribute('data-team-side');
        const input = document.getElementById(`add-player-input-${teamSide}`);
        if (input) {
            input.style.display = e.target.value === '__new__' ? '' : 'none';
        }
    });

    document.addEventListener('keypress', (e) => {
        if (e.key !== 'Enter' || !e.target.classList.contains('team-add-player-input')) return;
        const id = e.target.id || '';
        const teamSide = id.replace('add-player-input-', '');
        if (teamSide) handleAddPlayerDuringGame(teamSide);
    });
    
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            startGame();
        });
    }

    const finishSessionTeamSelectionBtn = document.getElementById('finish-session-team-selection-btn');
    if (finishSessionTeamSelectionBtn) {
        finishSessionTeamSelectionBtn.addEventListener('click', () => {
            if (confirm('Finish this session without playing this game? You will see today\'s stats.')) {
                AppState.currentGame = null;
                finishSession();
            }
        });
    }
    
    // Game In Progress Screen
    const viewTeamsBtn = document.getElementById('view-teams-btn');
    const blackGoalBtn = document.getElementById('black-goal-btn');
    const whiteGoalBtn = document.getElementById('white-goal-btn');
    const undoGoalBtn = document.getElementById('undo-goal-btn');
    const endGameBtn = document.getElementById('end-game-btn');
    
    const backToTeamSelectionBtn = document.getElementById('back-to-team-selection-btn');
    if (backToTeamSelectionBtn) {
        backToTeamSelectionBtn.addEventListener('click', () => {
            AppState.currentGame = null;
            AppState.viewingTeamsFromGame = false;
            saveSession();
            renderTeamSelection();
            showScreen('team-selection');
        });
    }

    if (viewTeamsBtn) {
        viewTeamsBtn.addEventListener('click', () => {
            AppState.viewingTeamsFromGame = true;
            AppState.teamAddPlayerMode = false;
            AppState.teamRemovePlayerMode = false;
            showScreen('team-selection');
        });
    }
    
    if (undoGoalBtn) {
        undoGoalBtn.addEventListener('click', () => {
            if (!confirm('Undo the last registered goal?')) {
                return;
            }
            undoLastGoal();
        });
    }
    
    if (blackGoalBtn) {
        blackGoalBtn.addEventListener('click', () => {
            renderGoalRegistration('black');
            showModal('goal-registration');
        });
    }
    
    if (whiteGoalBtn) {
        whiteGoalBtn.addEventListener('click', () => {
            renderGoalRegistration('white');
            showModal('goal-registration');
        });
    }
    
    if (endGameBtn) {
        endGameBtn.addEventListener('click', () => {
            if (confirm('End this game?')) {
                endGame();
            }
        });
    }
    
    // Goal Registration Modal
    const cancelGoalBtn = document.getElementById('cancel-goal-btn');
    const registerGoalBtn = document.getElementById('register-goal-btn');
    
    if (cancelGoalBtn) {
        cancelGoalBtn.addEventListener('click', () => {
            hideModal();
        });
    }
    
    if (registerGoalBtn) {
        registerGoalBtn.addEventListener('click', () => {
            const { team, scorer, assist } = AppState.goalRegistration;
            if (team && scorer) {
                registerGoal(team, scorer, assist || null);
            }
        });
    }
    
    // Goal/Assist button clicks (delegated)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('goal-btn-small') || 
            e.target.classList.contains('assist-btn-small')) {
            const playerId = e.target.getAttribute('data-player-id');
            const type = e.target.getAttribute('data-type');
            
            if (type === 'goal') {
                // Deselect other goal buttons
                document.querySelectorAll('.goal-btn-small').forEach(btn => {
                    btn.classList.remove('selected');
                });
                e.target.classList.add('selected');
                AppState.goalRegistration.scorer = playerId;
            } else if (type === 'assist') {
                // Deselect other assist buttons
                document.querySelectorAll('.assist-btn-small').forEach(btn => {
                    btn.classList.remove('selected');
                });
                e.target.classList.add('selected');
                AppState.goalRegistration.assist = playerId;
            }
            
            updateRegisterButtonState();
        }
    });
    
    // Game Summary Screen
    const proceedBtn = document.getElementById('proceed-btn');
    const finishSessionBtn = document.getElementById('finish-session-btn');
    const viewGamesBtn = document.getElementById('view-games-btn');
    
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            renderTeamSelection();
            showScreen('team-selection');
        });
    }
    
    if (finishSessionBtn) {
        finishSessionBtn.addEventListener('click', () => {
            if (confirm('Finish this session? You will see today\'s final stats.')) {
                finishSession();
            }
        });
    }

    if (viewGamesBtn) {
        viewGamesBtn.addEventListener('click', () => {
            AppState.editingGameIndex = null;
            renderGamesHistory();
            showScreen('games-history');
        });
    }
    
    // Games History Screen
    const gamesHistoryBackBtn = document.getElementById('games-history-back-btn');
    if (gamesHistoryBackBtn) {
        gamesHistoryBackBtn.addEventListener('click', () => {
            AppState.editingGameIndex = null;
            showScreen('game-summary');
        });
    }
    
    // Today's Stats Screen
    const continueSessionBtn = document.getElementById('continue-session-btn');
    const exportPngBtn = document.getElementById('export-png-btn');
    const resetAllDataBtn = document.getElementById('reset-all-data-btn');
    
    if (continueSessionBtn) {
        continueSessionBtn.addEventListener('click', () => {
            continueSession();
        });
    }
    
    if (exportPngBtn) {
        exportPngBtn.addEventListener('click', () => {
            exportTodaysStatsPng();
        });
    }
    
    if (resetAllDataBtn) {
        resetAllDataBtn.addEventListener('click', () => {
            resetAllData();
        });
    }
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
