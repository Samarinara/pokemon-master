# GAME DESIGN DOCUMENT  
**Title (working):** CHROMA  
**Core Module:** Battle System Specification  
**Version:** 1.0 (video-game first, authoritative for prototype)  

---

## 1. HIGH-CONCEPT ELEVATOR PITCH  
A simultaneous-move, 2-v-2 turn-based fighter where colour theory meets fighting-game mind-games. Players lock orders, guess block heights, and sling STAB-boosted moves while bench-mates leap in for reversal tags. One best-of-3 match lasts ~12 min.

---

## 2. CORE COMBAT LOOP (6-STEP)
1. **Planning Phase** (15 s timer, simultaneous)  
   - Each player assigns one order to each active fighter:  
     – Attack (pick move + target)  
     – Block (pick high / low)  
     – Switch (pick bench mate + optional “Switch-Attack” move)

2. **Resolution Queue**  
   - Build list of all actions → sort by Speed stat (highest first).  
   - Execute one at a time; mid-action state changes visible to later actions.

3. **Attack vs Block Check**  
   - Mid hit & blocked → deal damage, NO reversal.  
   - High/low hit & correct block → deal ½ damage, grant *Reversal Window* to defender.  
   - High/low hit & wrong block → deal 1.5× damage (crit) and defender –1 Spirit.

4. **Reversal Window** (instant, inside queue)  
   - Defender’s benched fighter may:  
     – perform any *Reversal* move (pre-marked, –1 power tier, no status)  
     – automatically tag in (original blocker goes to bench).  
   - Costs: incoming fighter loses its *next* turn action (greyed icon).

5. **Switch-Attack**  
   - If order = Switch, resolve at user’s speed slot.  
   - Old fighter exits, new fighter enters, immediately fires chosen move (–1 power).  
   - New fighter is now active; old fighter on bench.

6. **End-of-Turn**  
   - Apply DOT/status ticks.  
   - Check win condition (both actives KO ⇒ lose).  
   - Repeat until match end.

---

## 3. ROSTER & FIELD
- 3-mon roster per player.  
- 2 active slots (Left / Right), 1 bench slot.  
- Turn 0: secretly place any 2 active, 1 bench.  
- No duplicate monsters per roster.

---

## 4. STATS & SCALING
| Stat | Range (lv 50) | Function |
|------|---------------|----------|
| HP | 120 – 220 | Damage capacity |
| STR | 60 – 140 | Linear multiplier to move power |
| GUTS | 60 – 140 | Linear damage reduction (final = dmg × 100/(100+Guts)) |
| SPD | 60 – 140 | Turn-order value |
| SPIRIT | 60 – 140 | Starting accuracy pool & critical buffer |

Accuracy formula  
`TrueAcc = moveAcc × (1 + (Spirit – 60) / 400)` capped 10 % – 100 %  
Each critical hit landed on *you* –10 Spirit (recovers +5 at end of turn).

---

## 5. TYPE CHART & STAB
**Primary cycle:** Red → Yellow → Blue → Red  
**Secondary cycle:** Orange → Purple → Green → Orange  
**Neutrals:** Pink, Black (super-effective vs each other)

Damage multiplier  
- Super-effective 2×  
- Not very effective 0.5×  
- Neutral 1×

STAB  
- Primary user ⇒ 1.5× on moves of its own colour.  
- Secondary user ⇒ 1.2× on moves of its own colour *and* of its two primaries.  
*(Example: Purple = Red+Blue ⇒ Purple mon gets 1.2× on Purple, Red, Blue.)*

---

## 6. MOVE TEMPLATE
| Field | Acceptable Values |
|-------|-------------------|
| Name | string |
| Colour | Red / Yel / Blu / Ora / Pur / Gre / Pin / Blk |
| Height | High / Mid / Low |
| Power Tier | Weak (40) / Normal (70) / Strong (100) base |
| Accuracy | 10 – 100 % |
| Stat Stage | ±1 or ±2 to user or target (optional) |
| Status | Bleed / Shaken / Bruised with separate % chance |
| Flags | Reversal-legal, Switch-Attack-legal, Contact, Special, etc. |

Reversal moves: must be flagged at design time; auto-apply –1 power tier and cannot inflict primary status.

---

## 7. STATUS CONDITIONS
- **Bleed** – At end of turn lose 1/8 max HP; –1 stage STR & SPI.  
- **Shaken** – –30 % accuracy; –1 stage SPD.  
- **Bruised** – Attacker takes 15 % of damage dealt (capped at 25 % attacker max HP); –1 stage GUTS.

All stages cap at ±6; stage resets on switch-out.

---

## 8. CRITICAL HIT
Trigger: high hits low-block *or* low hits high-block.  
Effect: 1.5× damage, cannot drop target below 1 HP if target >50 % HP before hit.  
Secondary: target –1 Spirit.

---

## 9. SWITCHING RULES SUMMARY
- Normal switch: pick during planning, resolves at user’s speed, no other cost.  
- Switch-Attack: must pick *one* legal move (–1 power) that executes *after* entry.  
- Reversal-switch: consumes *next* turn’s action of the incoming fighter.

---

## 10. UI / UX REQUIREMENTS
- Planning screen shows 4-action grid (Left Active | Right Active) with distinct high/low block buttons.  
- Timeline bar post-lock: left-to-right sort of upcoming actions with colour-coded height icons.  
- Damage preview number already includes STAB, type effectiveness, and crit multiplier (shown in brackets if crit possible).  
- Spirit meter visibly ticks down when crit against you; accuracy % updates live.  
- Reversal prompt pops *inside* timeline with 3 s auto-timeout (defaults to “decline”).

---

## 11. BALANCE LEVERS
- Global scalar for crit damage (default 1.5×).  
- Reversal move power offset (default –1 tier).  
- Switch-Attack power offset (default –1 tier).  
- Spirit recovery per turn (default +5).  
- Stage decay on switch (optional, default 0).

---

## 12. REFERENCE TURN FLOW (PSEUDO-CODE)

```
function resolveTurn():
    actions ← collectLockedActions()
    queue ← sortBySpeed(actions)
    for action in queue:
        if action.type == ATTACK:
            defender ← target of action
            if defender.order == BLOCK:
                applyBlockLogic(action, defender)   // may trigger reversal
            else:
                dealDamage(action, defender)
        elif action.type == SWITCH:
            performSwitch(action)                   // includes Switch-Attack
    applyEndOfTurnEffects()
```

---

## 13. ASSET CHECKLIST
- 8 type icons, 4 palette swaps for STAB highlight.  
- 4 height icons (high, mid, low, personal-overhead).  
- Reversal flash VFX & UI prompt.  
- Crit hit-stop + camera shake + spirit drain VFX.  
- Timeline bar widget with draggable scrub for replays.

---

## 14. TEST CASES (MINIMUM)
1. Slow blocker (SPD 80) vs fast attacker (SPD 120) → blocker sets first, reversal window granted, bench reversal executes before any further actions.  
2. Mid attack vs any block → no reversal, normal damage.  
3. High attack vs low block → crit, 1.5× dmg, target Spirit –1, cannot KO from >50 % HP.  
4. Secondary mon uses primary-colour move → 1.2× displayed damage.  
5. Switch-Attack chosen → incoming mon spawns, fires –1 power move, old mon on bench, next turn icon grey if reversal-switch was used.  
6. Bruised attacker deals 100 dmg → take 15 self-dmg (capped at 25 % max HP).

End of document – ready for prototype implementation.