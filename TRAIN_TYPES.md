# Commercial service inventory

This inventory was audited against the bundled SNCF GTFS feed version `2026-07-22` (service period 2026-07-22 through 2026-12-31).

## Classification rule

The service filter represents the commercial service associated with each individual trip. It does not use `route_short_name` codes or `route_long_name` corridors as ticket brands.

The parser first reads the SNCF service code embedded in `trip_id`, then checks explicit brand metadata when available. A corridor name is retained separately for the journey details. If neither source establishes a service, the filter displays `Unknown` rather than guessing from a destination or a bare `TGV` suffix.

| Feed signal | Displayed service | Trips |
|---|---|---:|
| `OUI` | TGV INOUI | 8,326 |
| `OGO` | OUIGO Grande Vitesse | 591 |
| `TRN` on route `361A` Paris-Brussels | OUIGO Train Classique | 106 |
| `IC` | INTERCITÉS | 785 |
| `ICN` | INTERCITÉS de nuit | 234 |
| `LYR` | TGV Lyria | 351 |
| `ICE` | ICE / DB–SNCF | 254 |
| `TER` or `CTE` | TER | 37,490 |
| `TT` | Tram-train | 452 |
| `NAV`, or an explicit `Navette` corridor | Shuttle | 355 |
| No reliable service signal | Unknown | 98 |
| **Total** | | **49,042** |

`CTE` records share the TER ticket/service category even when the scheduled vehicle is a regional coach. The Paris-Brussels `TRN` records are the OUIGO Train Classique services numbered 50/54 and related trains in this feed.

## Trips intentionally left unknown

All remaining unknown records use the `CRE` service code. Their corridors suggest a probable family, but the feed does not establish the commercial service strongly enough to distinguish INOUI, INTERCITÉS, a special train, or another product.

| Route code | Corridor detail | Unknown trips |
|---|---|---:|
| `071B` | Lux/Alsace/Loraine - LR | 2 |
| `190A` | Metz - Lyon | 1 |
| `401A` | Paris - Brest TGV | 1 |
| `401C` | Paris - Quimper TGV | 2 |
| `411B` | Paris - Les Sables d'Olonnes TGV | 2 |
| `421D` | Paris - Bordeaux - Arcachon TGV | 11 |
| `421I` | Paris - Poitiers - La Rochelle TGV | 36 |
| `555C` | Paris - Rodez / Albi | 4 |
| `560A` | Paris - Brive | 7 |
| `770A` | Paris - Briançon | 6 |
| `803A` | Paris - Metz TGV | 9 |
| `803B` | Paris - Thionville - Luxembourg TGV | 6 |
| `805A` | Paris - Nancy TGV | 11 |

The inventory is feed-specific. Future archives may add service codes; unknown codes should be audited before being assigned a rider-facing commercial label.
