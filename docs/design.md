# Surge Design Document

## Motivation

Surge was born from a simple premise: what if a typing game felt like hacking?

Most typing games present words as neutral targets - type them fast, get points. Surge reframes this as survival. You're a process inside a dying machine. Bugs aren't just words - they're active threats crawling toward your firewall, trailing matrix wires that represent their data injection. The terminal isn't a limitation, it's the medium. You're already in the machine.

The name "Surge" comes from the game's ultimate ability: when you've killed enough bugs, you can type `surge` to fumigate everything at once. It's the power fantasy payoff after sustained pressure.

## Core Loop

```
See bug → Read word → Decide when to type → Type it → Score + combo → Repeat
                              ↑
                    Risk/reward decision point
```

The decision of **when** to type is what separates Surge from other typing games. You can always type a word as soon as you see it (safe, low score). Or you can wait until the wire is almost touching (dangerous, 3x score). This creates a constant micro-gambling loop that makes every word feel consequential.

## Risk / Reward Timing

### The Zone System

Position is normalized 0-1 across the field. The wire grows from the right toward the word on the left. Three scoring zones create a gradient of risk:

```
Word appears                    Wire touches              Bug injects
    |                               |                         |
    v                               v                         v
[===== SAFE (1x) =====|==== RISKY (2x) ====|= CRITICAL (3x) =|X MISSED]
0                    0.5                   0.85              1.05
```

- **SAFE (1x)**: The wire is far away. No pressure. Typing here is boring but reliable.
- **RISKY (2x)**: The wire is approaching. You can see it getting closer. Double points.
- **CRITICAL (3x)**: The wire is touching or about to touch. Triple points. Hitstun is imminent.
- **MISSED**: The bug reached your firewall. You take damage, lose your combo, and score nothing.

### Why This Works

The 3x multiplier at CRITICAL is deliberately generous. It rewards the exact behavior that creates the most exciting gameplay: waiting until the last possible moment. Combined with the combo multiplier (`1 + floor(combo/3) * 0.5`), skilled players can achieve massive scores by consistently hitting CRITICAL kills without breaking their combo.

But one miss resets the combo to zero. The combo multiplier creates a separate risk layer on top of the zone system: even if you're confident in your typing, the combo pressure makes each kill feel like it has stakes beyond just that single word.

### The Surge Meter

Killing bugs fills the surge meter. CRITICAL kills fill it 3x faster than SAFE kills. When full, typing "surge" kills everything on screen at CRITICAL multiplier.

This creates a secondary incentive to play dangerously: not only do CRITICAL kills score more, they charge your panic button faster. But surge is also your insurance policy - if the screen gets overwhelming, you need it. So there's tension between using surge defensively (survive) and building surge aggressively (score).

## Visual Design

### Matrix Wire

The wire is the game's signature visual element. Random hex characters (`0-9a-f`) stream with per-character brightness that varies by proximity (brighter near the word) and overall progress (brighter as the wire gets longer). When the player is targeting a word, the wire flow reverses direction, creating a subtle visual feedback.

The wire serves multiple purposes:
1. **Countdown timer**: You can see exactly how much time you have
2. **Threat indicator**: Brightness communicates urgency
3. **Thematic glue**: It looks like data flowing through a circuit

### Per-Enemy Wire Contact

The wire grows at a constant visual speed (`fieldWidth` columns per 1.0 position unit). This means the wire doesn't care how long the word is - it always moves at the same pace. But longer words take up more space on the left, leaving a shorter gap for the wire to cross.

Result: longer words get contacted sooner. A 3-letter word might survive until position ~0.97 before contact. A 9-letter word gets touched at ~0.89. This is both mechanically fair (longer words are harder to type, so they have proportionally less CRITICAL window) and visually coherent (the wire physically touches the word).

### Elastic Injection

When the wire touches a word, the word stretches toward the right wall with staggered cubic easing. Each letter has a slightly different delay, creating an organic "pulling" effect. The wire stays visible underneath as a dim red backdrop, so you can see the injection happening.

This phase is when the bug deals damage if not killed. The stretching animation communicates "this is leaving the word and entering your system."

### Hitstun

Borrowed from Nintendo fighting games: a brief freeze frame (8 ticks, ~400ms) when the wire first touches a word. During the freeze:
- All movement stops
- The wire and word flash bold red
- The matrix animation freezes (frozen tick passed to wireChar)

This communicates the moment of impact. The player feels the collision viscerally, even in a text terminal. It also creates a micro-window where the player can still type the word to kill it before injection completes.

### Wall Creep

When HP drops below 30%, red matrix wires start bleeding through the firewall on the right side of each lane. The amount of creep is proportional to how close to death you are:
- 30% HP: barely visible, 1-2 columns
- 15% HP: noticeable intrusion, ~15% of field width
- 1% HP: wires covering ~30% of the field

Per-lane sine-wave jitter creates an organic, unstable look. This is pure environmental storytelling: the system is failing, the wires are getting through.

### Death Animation

When HP hits zero, the creep effect transitions seamlessly into a full-screen takeover:
1. Lane wires flood from right to left (continuing from where creep stopped)
2. Outer lanes get consumed first, center lanes lag (wave front effect)
3. After 60% progress, the header and bottom chrome start getting eaten
4. Score and combo in the bottom border are protected (you see your final score)
5. After ~3 seconds, transition to game over screen

### Command Prompt

The input area reads `$ rm bugname█`, styled as a Unix terminal command. You're literally typing `rm` (remove) commands to delete bugs. This small detail anchors the entire fantasy without any exposition.

## Wave Design

### Phrase-Based Spawning

Enemies don't spawn uniformly. They arrive in **phrases**: bursts of 2-4 bugs with short gaps (6-12 ticks), separated by longer rests (20-50 ticks). This creates rhythm:

```
type-type  ...breathe...  type-type-type  ...breathe...  type-type
```

The phrase structure prevents the game from feeling like a relentless stream. Rest periods let players reset mentally, check the surge meter, and prepare for the next burst.

### Difficulty Progression

Eight hand-tuned waves, then auto-scaling:

- **Waves 1-2**: Short words (3-4 letters), slow speed, small bursts. Learning the controls.
- **Waves 3-4**: Medium words appear, speed increases. Players learn zone timing.
- **Waves 5-6**: Long words, tighter spawning. Combo management becomes critical.
- **Waves 7-8**: Full difficulty. Fast enemies, long words, tight bursts.
- **Wave 9+**: Auto-scales: enemy count × 1.1, speed × 1.1 per wave. Infinite scaling.

### Lane Locking

Only one live enemy per lane. This prevents visual overlap and ensures every word is readable. When all lanes are occupied, spawning retries in 5 ticks. This naturally caps screen density while allowing the spawning system to remain simple.

## Power-Up System

Power-ups spawn at 15% chance per regular enemy spawn (wave 1+). They move fast (1.5-2.5x max wave speed) and have magenta styling to stand out. They deal no damage if missed.

| Effect | Words | Duration | Purpose |
|--------|-------|----------|---------|
| Heal | patch, fix, malloc | Instant | +25 HP, survival recovery |
| Surge Boost | defrag, clean | Instant | +5 surge meter |
| Double Score | optimize, overclock | 10 seconds | 2x all points |
| Slow | freeze, coolant, suspend | 10 seconds | 0.4x enemy speed |

Power-ups are deliberately fast to create a different kind of challenge: you need to react quickly to catch them, but they're helpers, not threats. Missing one costs nothing. This creates positive urgency (opportunity) instead of negative urgency (threat).

## Future: Multiplayer Battle Royale

### Vision

Multiplayer Surge over SSH, styled as a BBS door game from the early internet. Players connect to a shared server and compete in real-time typing battles.

### BBS Aesthetic

The terminal-native approach is the feature, not the limitation. Connecting via SSH should feel like dialing into a BBS:

- ANSI art login screen with retro styling
- Player handles (choose your hacker name)
- "Connecting..." modem-style animation
- Persistent leaderboards in ASCII tables
- Chat between rounds via terminal split-screen
- Tournament brackets displayed in box-drawing characters

### Technical Architecture

```
                    SSH Server (Node.js + ssh2)
                         |
            ┌────────────┼────────────┐
            v            v            v
      Player A      Player B      Spectator
      (xterm)       (xterm)       (xterm)
         |              |            |
    ┌────v────┐    ┌────v────┐      |
    │GameState│    │GameState│      |
    │ + Input │    │ + Input │      |
    └────┬────┘    └────┬────┘      |
         └──────┬───────┘           |
                v                   v
         Shared Wave Engine    Frame Multiplex
         (synchronized ticks)  (any player's view)
```

- **SSH server**: Node.js `ssh2` library serving PTY sessions
- **Shared wave engine**: All players face the same bugs at the same time
- **Per-player state**: Individual HP, score, combo, input buffer
- **Frame multiplexer**: Spectators can watch any player's terminal output live
- **State sync**: Redis pub/sub or in-memory broadcast for tick synchronization

### Multiplayer Mechanics

**Competitive:**
- **Steal kills**: Type another player's bug before they do to steal the points
- **Send bugs**: High combos generate bonus bugs that appear in opponents' screens (Tetris attack style)
- **Elimination**: Fixed HP, no healing power-ups, last player standing wins

**Cooperative:**
- **Shared surge**: All players contribute to a collective surge meter
- **Wave defense**: Bugs target the group, any player can kill any bug
- **Boss waves**: Special waves with a single massive word that requires multiple players typing different parts

**Meta:**
- **Ranked ladder**: ELO-based matchmaking by typing speed tier
- **Daily challenges**: Fixed seed waves, global leaderboard
- **Seasons**: Monthly resets with new word lists and wave configs

### Why SSH?

No browser. No client install. No Electron. Just:

```sh
ssh surge.example.com
```

This is the most cyberpunk way to play a game about being inside a terminal. It also has practical benefits: works from any machine with an SSH client, sessions persist across disconnects (tmux), and the server controls the game state entirely (no client-side cheating).

The terminal IS the game. Always has been.
