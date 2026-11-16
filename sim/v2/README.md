# ルール調整 v2 の測定ログ

`node sim/selfplay.js --rules '<JSON>'` の生の出力です。既定ルールが v2（hold 2・easeAt 60）になったため、
v1 を再現するには `{"hold":1,"easeAt":0}` を明示します。

| ファイル | 報告書での記号 | --rules |
|---|---|---|
| A.txt | A（v1） | `{"hold":1,"easeAt":0}` |
| B.txt | B | `{"hold":2,"easeAt":0}` |
| Cx.txt | C′ | `{"hold":1,"easeAt":0,"zone":"x"}` |
| D1.txt | D1 | `{"hold":1,"easeAt":0,"support":true}` |
| E80.txt | D2-80 | `{"hold":2,"easeAt":80}` |
| E60.txt | D2（採用） | `{"hold":2,"easeAt":60}` |
| H3E60.txt | D3 | `{"hold":3,"easeAt":60}` |
| B_fk.txt | K1（B の上で測定） | `{"hold":2,"easeAt":0,"firstKing":true}` |
| K2.txt | K2 | `{"hold":2,"easeAt":60,"easeAt2":40}` |
| A_d3x / B_d3x / E60_d3x / K2_d3x | 3 手読み同士の追加 400 局 | 上記に `--series "3,3,400" --seed0 5000` |
| E60_d5a / E60_d5b | 5 手読み同士 30 局 ×2（参考） | `--series "5,5,30"`、後者は `--seed0 30` |
