# Sprite sheets v2

Cada personagem possui uma folha individual de 1280 × 2048 pixels, com fundo
transparente e 32 quadros organizados em uma grade regular de 4 × 8. Cada célula
mede 320 × 256 pixels. A coleção inclui os seis lutadores jogáveis e os três
adversários do modo arcade.

As linhas, de cima para baixo, representam: `idle`, `walk`, `punch`, `kick`,
`crouchGuard`, `jump`, `special` e `hurtRecovery`. Em cada linha, os quatro
quadros avançam da esquerda para a direita.

O arquivo `manifest.json` contém os índices usados pelo Phaser. As sequências
que vieram combinadas na arte de origem são reutilizadas nas ações compatíveis,
mantendo sempre quatro quadros por estado e evitando recortes entre células.
