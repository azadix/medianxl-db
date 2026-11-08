Yes. Same engine rule as Paragon — and it hits mana harder than people usually expect.

## How the ops layer

In `itemstatcost.txt` (2.14.6 dump):

| Stat | Op | Effect |
|---|---|---|
| `is1` energy | **8** | adds mana from energy (`ManaPerMagic`) |
| `is3` vitality | **9** | adds life/stamina from vitality |
| `is76` / `is77` | **11** | `% max life` / `% max mana` |
| `is361` / `is362` | **11** | `% energy` / `% vitality` |
| `is482` (Paragon path) | **2** | `(value × is480) >> 5` → vitality |

The accumulator in `Stats_StatsEx_6fd89530` does this:

1. Take the **pre-op base** of the stat (`local_10`)
2. **Op 11** adds `base × percent / 100` (so final ≈ base × (100+%))
3. **Op 8 / 9 / 2** add their contribution to the running total **outside** that percentage

## Paragon (your example)

Paragon stores the per-gem amount in `is480`. `is482` uses **op 2** to push that into vitality **after** `% vitality` / `% all attributes` (op 11 on `is3`). So Paragon vit is real vitality, but it never sits in the op-11 base — matching what you see.

## Mana / life from energy / vitality vs `% increased mana/life`

**Yes — large classes of energy→mana and vitality→life are NOT multiplied by `% mana` / `% life`.**

Op 8 / 9 only convert **bonus** attributes:

```1608:1647:C:\Users\barto\Desktop\Median Tools\sigmaRE\5_game_source\D2Common\Stats\StatsEx.cpp
      case '\b':
        // ...
          iVar7 = Stats_StatsEx_6fd89530(param_1,iVar7);
          if (iVar7 - iVar3 != 0) {
            local_18 = local_18 + (uint)*(byte *)(iVar4 + 0x48) * (iVar7 - iVar3) * 0x40;
          }
        // ...
      case '\t':
        // ...
          iVar7 = iVar7 - iVar3;
          if (iVar7 != 0) {
            // ... LifePerVitality / StaminaPerVitality * (full - base)
```

`iVar7 - iVar3` = **accrued − base** energy/vitality. That delta’s mana/life is added after `% mana`/`% life`.

### Not increased by `% mana` / `% life`
- Mana from **item / skill / bonus energy** (anything above base spent energy)
- Life from **item / skill / bonus vitality** (incl. Paragon’s vit via `is482`)
- The mana/life that comes from **`% energy` / `% vitality`** (those inflate accrued attr, so they land in the op 8/9 delta)
- **Mana/life per level** (`is217` / `is216`, op 2) — same “add after %” path

### Still increased by `% mana` / `% life`
- Mana/life from **spent** energy/vitality (baked into base when you allocate)
- Mana/life from **levels** / starting values
- Flat **`+mana` / `+life`** on items

So the mana analogue of Paragon is: **bonus energy → mana via op 8 never sees `% increased mana`**. Flat `+mana` does; energy-derived mana does not.

No sigma hook turned up that rewrites this path — MedianXL is still on the stock 1.10+ op 8/9/11 layering. Snapshot is 2.14.6 only.
