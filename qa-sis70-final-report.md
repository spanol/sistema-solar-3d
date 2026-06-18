## QA Concluído — SIS-53 Toggle Dist. Real ✅ APROVADO

Testei todos os critérios de aceitação via Playwright headless (1440×900 desktop + 390×844 mobile). Zero falhas reais.

---

### Critérios verificados

| # | Critério | Resultado | Evidência |
|---|----------|-----------|-----------|
| 1 | Botão `⊖ Dist. Real` existe no painel de controles | ✅ PASS | Screenshot inicial |
| 2 | `aria-pressed="false"` na carga inicial | ✅ PASS | DOM attribute verificado |
| 3 | Zero erros de console na carga | ✅ PASS | 0 erros capturados |
| 4 | Ao ativar: `aria-pressed="true"`, classe `active`, URL tem `realscale=1` | ✅ PASS | URL: `#orbits=1&labels=1&speed=1&realscale=1` |
| 5 | Câmera recua para `TOP_CAM_REAL` (y=560) | ✅ PASS | Screenshot mostra planetas externos comprimidos ao centro, câmera recuou |
| 6 | Órbitas lerp-animam para escala real (Netuno fora do frame) | ✅ PASS | Screenshot 02 confirma Netuno no topo da tela |
| 7 | Ao desativar: órbitas voltam ao layout comprimido | ✅ PASS | Screenshot 03 igual ao inicial |
| 8 | Asteroid belt cross-fade (compressed ↔ real) | ✅ PASS | Código: `asteroidBeltCompressed.opacity` e `asteroidBeltReal.opacity` via `realScaleLerpT` |
| 9 | Deep-link `#realscale=1` restaura estado (página fresca) | ✅ PASS | `aria-pressed="true"` + classe `active` em página nova |
| 10 | Deep-link `#planet=earth&realscale=1` restaura ambos | ✅ PASS | Botão ON + card visível |
| 11 | Seleção de planeta com realscale ON (key `3` = Terra) | ✅ PASS | Card "Terra" visível, front view OK |
| 12 | Zero erros de console na seleção de planeta com realscale | ✅ PASS | 0 erros |
| 13 | Toggle bloqueado em front view (`viewMode !== 'top'`) | ✅ PASS | JS click: `aria-pressed` ficou `false` sem mudar |
| 14 | Escape retorna ao top view; toggle funciona de novo | ✅ PASS | Controls reaparecem, toggle responde |
| 15 | Toggle de Órbitas funciona com realscale ON | ✅ PASS | `aria-pressed` alternado corretamente |
| 16 | Toggle de Labels funciona com realscale ON | ✅ PASS | `aria-pressed` alternado corretamente |
| 17 | Botão visível no mobile (390px) | ✅ PASS | Screenshot mobile confirma |

### Dados verificados (código)
- `SCENE_UNITS_PER_MKM = 16 / 149.6`
- Netuno real: `4515 Mkm × 0.10695 = 482.89 ≈ 483 units` ✅ spec
- `TOP_CAM_REAL = (0, 560, 32)` ✅ spec
- Asteroid belt real: `makeAsteroidBelt(35.2, 51.2)` = 2.2–3.2 AU ✅ correto
- Deep-link serializa `realscale=1` via `serializeHash()` ✅

### Observação sobre `hashchange`
O app não escuta `hashchange` — `restoreFromHash()` só é chamado uma vez no boot. O deep-link funciona corretamente ao abrir a URL em tab/janela nova. Comportamento esperado do browser.

**Veredicto: APROVADO. Zero bugs. Zero regressões. Feature pronta para produção.**
