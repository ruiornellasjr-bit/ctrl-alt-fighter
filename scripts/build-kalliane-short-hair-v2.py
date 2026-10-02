"""Build and install Kalliane's short-hair v2 sprites and animations."""
from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "art-source/characters/kalliane/v2-short-hair"
GEN = Path(r"C:/Users/CostMonter/.codex/generated_images/01a0f46c-1bf5-7ac0-8e4b-bead555b5893")
PORTRAIT_SOURCE = "exec-9b306d3c-ed45-4027-b045-fcd3f640abe2.png"
WALK12_SOURCE = "exec-6b71c9ea-d16a-4b85-aa42-f4dc06645d75.png"
WALK_BACK12_SOURCE = "exec-3509a662-905e-47fe-a674-d0c2b15bb1df.png"
FILES = {
    "locomotion": "exec-84f64bbd-80e7-4e36-92cf-e1aaabb677c4.png",
    "flight": "exec-e3bd88b1-550b-4b69-be22-7e803b5f5ad2.png",
    "attacks": "exec-825ecdd1-d682-4496-84e8-55693f4cde08.png",
    "damage": "exec-466f465c-73cc-490d-9db0-0d03872817b2.png",
    "defense": "exec-63cb2424-1708-45d0-86f3-c7e2c03cecb1.png",
    "special": "exec-741c9c0f-2716-463c-ad5f-271a83c4689e.png",
    "strong": "exec-5c10cdc3-d341-4dbd-b56d-fa57b1c2211b.png",
}
POSES = {
    "locomotion": ["idle", "walk", "run", "backhop"],
    "flight": ["jump", "doublejump", "airkick", "land"],
    "attacks": ["punch", "gauncho", "kick", "sweep"],
    "damage": ["hurt", "hurtStrong", "hurtLow", "hurtHigh"],
    "defense": ["crouch", "guard", "knockdown", "getup"],
    "special": ["special", "super", "blockHit", "victory"],
    "strong": ["punchStrong", "kickStrong"],
}
PROMPT_SEQUENCES = {
    "locomotion": "ROW 1 calm fighting idle with breathing and slight guard adjustments; ROW 2 natural forward walking with alternating steps; ROW 3 forward running with alternating strides; ROW 4 quick backward evasive hop to the left while still facing right, land and return to guard.",
    "flight": "ROW 1 vertical jump: anticipation, takeoff, rise, apex guard, descend, soft landing; ROW 2 double jump with a clear second upward impulse, apex, descent and recovery; ROW 3 controlled airborne forward kick to the right, extension, retraction and recovery; ROW 4 landing absorbs impact through bent knees and returns to guard.",
    "attacks": "ROW 1 weak straight punch to the right; ROW 2 rising hook/uppercut to the right; ROW 3 weak front kick to the right; ROW 4 low sweeping kick to the right. Six connected wind-up, contact, retract and recovery frames per row.",
    "damage": "Six connected non-graphic frames per row: ROW 1 light body-hit flinch; ROW 2 heavy strong-hit recoil; ROW 3 low-hit knee buckle; ROW 4 high-hit head-and-shoulder recoil. No injury or blood.",
    "defense": "Six connected frames per row: ROW 1 low crouching guard; ROW 2 standing two-arm block; ROW 3 controlled backward knockdown fall and recovery; ROW 4 rise from ground back into fighting guard.",
    "special": "Preserve current powers: ROW 1 Proposta irresistível, charge and cast a compact pink-and-gold contract card projectile to the right; ROW 2 existing magenta-and-gold network shield forms, braces, fades; ROW 3 super Contrato Assinado, decisive two-fist lunge with compact gold seal/starburst; ROW 4 solo friendly victory. No readable text.",
    "strong": "ROW 1 six connected frames of powerful straight punch to the right: guard, coil, step, full extension, retract, recover; ROW 2 six connected frames of high roundhouse kick: knee lift, hip turn, extension, retract, land and recover.",
}
LABELS = {
    "idle": "Parada", "walk": "Caminhada", "run": "Corrida", "backhop": "Recuo",
    "jump": "Pulo", "doublejump": "Pulo duplo", "airkick": "Chute aéreo", "land": "Pouso",
    "punch": "Soco fraco", "gauncho": "Gancho", "kick": "Chute fraco", "sweep": "Rasteira",
    "hurt": "Dano fraco", "hurtStrong": "Dano forte", "hurtLow": "Dano baixo", "hurtHigh": "Dano alto",
    "crouch": "Agachamento", "guard": "Defesa", "knockdown": "Queda", "getup": "Levantada",
    "special": "Proposta irresistível", "super": "Contrato Assinado", "blockHit": "Defesa atingida", "victory": "Vitória",
    "punchStrong": "Soco forte", "kickStrong": "Chute forte",
}
# The generated guard/crouch/air poses occupied more of their cells than the
# normal stance and appeared to grow during play. Keep those sequences slightly
# smaller while preserving the shared foot baseline.
POSE_SCALE = {
    "crouch": 0.90,
    "guard": 0.92,
    "jump": 0.92,
    "doublejump": 0.92,
    "airkick": 0.92,
    "land": 0.92,
}
FRAME_OVERRIDES = {
    "guard": {
        0: "guard-01.png",
        1: "guard-02.png",
        2: "guard-03.png",
        3: "guard-04.png",
        4: "guard-05.png",
        5: "guard-06.png",
    },
    "punch": {
        2: "punch-03.png",
        3: "punch-04.png",
    },
    "punchStrong": {
        2: "punchStrong-03.png",
        3: "punchStrong-04.png",
    },
    "victory": {
        0: "victory-01.png",
        1: "victory-02.png",
        2: "victory-03.png",
        3: "victory-04.png",
        4: "victory-05.png",
        5: "victory-06.png",
    },
}
OVERRIDE_HEIGHT = {"guard": 212, "punch": 208, "punchStrong": 208, "victory": 208}
spec = importlib.util.spec_from_file_location("six_frame_atlases", ROOT / "scripts/build-yafa.py")
atlases = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlases)
packer_spec = importlib.util.spec_from_file_location("cell_isolator", ROOT / "scripts/build-caio-v1.py")
cell_packer = importlib.util.module_from_spec(packer_spec)
packer_spec.loader.exec_module(cell_packer)


def main() -> None:
    source_dir = OUT / "sources"
    frame_dir = OUT / "frames"
    preview_dir = OUT / "previews"
    atlas_dir = OUT / "atlases"
    for directory in (source_dir, frame_dir, preview_dir, atlas_dir):
        directory.mkdir(parents=True, exist_ok=True)
    extracted = {}
    for group, name in FILES.items():
        source = GEN / name
        destination = source_dir / f"{group}.png"
        shutil.copy2(source, destination)
        rows = len(POSES[group])
        prepared = OUT / "prepared" / f"{group}.png"
        cell_packer.isolate_cells(destination, rows, 6, prepared)
        cells, factor = atlases.extract(prepared, rows)
        extracted[group] = (cells, factor)

    scale = min(
        212 / extracted["locomotion"][0][0].height,
        min(302 / (cell.width * factor) for cells, factor in extracted.values() for cell in cells),
        min(238 / (cell.height * factor) for cells, factor in extracted.values() for cell in cells),
    )
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 17)
    previews: dict[str, list[Image.Image]] = {}
    for group, poses in POSES.items():
        cells, factor = extracted[group]
        atlas = Image.new("RGBA", (320 * 6, 256 * len(poses)))
        for row, pose in enumerate(poses):
            sequence = []
            pose_scale = POSE_SCALE.get(pose, 1.0)
            for index in range(6):
                override_path = FRAME_OVERRIDES.get(pose, {}).get(index)
                if override_path:
                    override_file = source_dir / "overrides" / override_path
                    with Image.open(override_file) as override_image:
                        cell = override_image.convert("RGBA")
                    visible_alpha = cell.getchannel("A").point(lambda value: 255 if value > 24 else 0)
                    bbox = visible_alpha.getbbox()
                    if bbox is None:
                        raise ValueError(f"Quadro de correção sem arte: {override_file}")
                    cell = cell.crop(bbox)
                    # Mantenha o corpo no tamanho das outras fases do soco,
                    # mas reserve folga para a mão à direita da célula.
                    target_height = OVERRIDE_HEIGHT.get(pose, 208)
                    multiplier = min(target_height / cell.height, 292 / cell.width)
                else:
                    cell = cells[row * 6 + index]
                    multiplier = scale * factor * pose_scale
                size = (round(cell.width * multiplier), round(cell.height * multiplier))
                resized = cell.resize(size, Image.Resampling.LANCZOS)
                alpha = np.array(cell)[:, :, 3]
                contact = np.flatnonzero(np.any(alpha[int(cell.height * .88):] > 24, axis=0))
                pivot = (int(contact[0]) + int(contact[-1])) / 2 if len(contact) else cell.width / 2
                x = max(8, min(312 - resized.width, round(160 - pivot * multiplier)))
                y = 248 - resized.height
                if y < 8 or x + resized.width > 312:
                    raise ValueError(f"{pose} quadro {index + 1} excede a célula: {(x, y, *resized.size)}")
                frame = Image.new("RGBA", (320, 256))
                frame.alpha_composite(resized, (x, y))
                (frame_dir / pose).mkdir(parents=True, exist_ok=True)
                frame.save(frame_dir / pose / f"{index + 1:02d}.png")
                atlas.alpha_composite(frame, (index * 320, row * 256))
                preview = Image.new("RGB", (320, 288), "#101b2a")
                ImageDraw.Draw(preview).text((12, 8), LABELS[pose], font=font, fill="#c2ef98")
                preview.paste(frame, (0, 32), frame)
                sequence.append(preview)
            durations = [100] * 6 if pose in ("walk", "run") else [130] * 5 + [550]
            sequence[0].save(preview_dir / f"{pose}.gif", save_all=True, append_images=sequence[1:], duration=durations, loop=0)
            previews[pose] = sequence
        target = atlas_dir / f"kalliane-v2-{group}.webp"
        atlas.save(target, "WEBP", lossless=True, method=6, exact=True)
        with Image.open(target) as verified:
            if verified.convert("RGBA").tobytes() != atlas.tobytes():
                raise ValueError(f"Lossless atlas verification failed: {target}")

    walk_sequences = {}
    for pose, generated_file in (("walk", WALK12_SOURCE), ("walkBack", WALK_BACK12_SOURCE)):
        source_name = "walk-12frames.png" if pose == "walk" else "walk-back-12frames.png"
        walk_source = source_dir / source_name
        shutil.copy2(GEN / generated_file, walk_source)
        walk_prepared = OUT / "prepared" / source_name
        cell_packer.isolate_cells(walk_source, 3, 4, walk_prepared)
        walk_cells, walk_factor = atlases.extract(walk_prepared, 3, 4)
        walk_sequences[pose] = (walk_cells, walk_factor)
    with Image.open(frame_dir / "walk/01.png") as old_walk:
        target_height = old_walk.getchannel("A").getbbox()[3] - old_walk.getchannel("A").getbbox()[1]
    max_height = max(cell.height * factor for cells, factor in walk_sequences.values() for cell in cells)
    max_width = max(cell.width * factor for cells, factor in walk_sequences.values() for cell in cells)
    walk_scale = min(target_height / max_height, 300 / max_width)
    for pose, (walk_cells, walk_factor) in walk_sequences.items():
        walk_atlas = Image.new("RGBA", (320 * 6, 256 * 2))
        walk_previews = []
        frame_name = "walk12" if pose == "walk" else "walkBack12"
        for index, cell in enumerate(walk_cells):
            factor = walk_scale * walk_factor
            resized = cell.resize((round(cell.width * factor), round(cell.height * factor)), Image.Resampling.LANCZOS)
            alpha = np.array(cell)[:, :, 3]
            contact = np.flatnonzero(np.any(alpha[int(cell.height * .88):] > 24, axis=0))
            pivot = (int(contact[0]) + int(contact[-1])) / 2 if len(contact) else cell.width / 2
            x = max(8, min(312 - resized.width, round(160 - pivot * factor)))
            y = 248 - resized.height
            if y < 8 or x + resized.width > 312:
                raise ValueError(f"{pose} 12 quadros excede célula {index + 1}: {(x, y, *resized.size)}")
            frame = Image.new("RGBA", (320, 256))
            frame.alpha_composite(resized, (x, y))
            (frame_dir / frame_name).mkdir(parents=True, exist_ok=True)
            frame.save(frame_dir / frame_name / f"{index + 1:02d}.png")
            walk_atlas.alpha_composite(frame, ((index % 6) * 320, (index // 6) * 256))
            title = "Caminhada" if pose == "walk" else "Recuo andando"
            preview = Image.new("RGB", (320, 288), "#101b2a")
            ImageDraw.Draw(preview).text((12, 8), f"{title} · quadro {index + 1}/12", font=font, fill="#c2ef98")
            preview.paste(frame, (0, 32), frame)
            walk_previews.append(preview)
        walk_atlas_path = atlas_dir / f"kalliane-v2-{frame_name}.webp"
        walk_atlas.save(walk_atlas_path, "WEBP", lossless=True, method=6, exact=True)
        with Image.open(walk_atlas_path) as verified:
            if verified.convert("RGBA").tobytes() != walk_atlas.tobytes():
                raise ValueError(f"Lossless walk atlas verification failed: {walk_atlas_path}")
        preview_name = "walk-12frames.gif" if pose == "walk" else "walk-back-12frames.gif"
        walk_previews[0].save(preview_dir / preview_name, save_all=True, append_images=walk_previews[1:], duration=[60, 50] * 6, loop=0)

    runtime_dir = ROOT / "public/assets/characters/kalliane"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    for stale_draft_atlas in atlas_dir.glob("kalliane-v2-draft-*.webp"):
        stale_draft_atlas.unlink()
    for atlas in atlas_dir.glob("kalliane-v2-*.webp"):
        shutil.copy2(atlas, runtime_dir / atlas.name)
    portrait_source = GEN / PORTRAIT_SOURCE
    shutil.copy2(portrait_source, OUT / "portrait-v2.png")
    with Image.open(portrait_source) as opened:
        portrait = opened.convert("RGBA")
    portrait.thumbnail((600, 900), Image.Resampling.LANCZOS)
    portrait_path = OUT / "portrait-v2.webp"
    portrait.save(portrait_path, "WEBP", quality=88, method=6, exact=True)
    shutil.copy2(portrait_path, runtime_dir / "portrait-v2.webp")
    # Remove only the no-longer-referenced runtime art; editable v1 source stays under art-source.
    for old_asset in [*runtime_dir.glob("kalliane-v1-*.webp"), runtime_dir / "portrait.webp"]:
        if old_asset.exists():
            old_asset.unlink()

    selected = ["walk", "run", "backhop", "jump", "punch", "punchStrong", "kickStrong", "sweep", "special"]
    for phase in range(6):
        montage = Image.new("RGB", (960, 864), "#101b2a")
        for index, pose in enumerate(selected):
            montage.paste(previews[pose][phase], ((index % 3) * 320, (index // 3) * 288))
        montage.save(OUT / f"preview-{phase + 1:02d}.jpg", quality=92)
    montage_frames = [Image.open(OUT / f"preview-{i:02d}.jpg") for i in range(1, 7)]
    montage_frames[0].save(OUT / "preview.gif", save_all=True, append_images=montage_frames[1:], duration=[130] * 5 + [550], loop=0)
    manifest = {
        "status": "implemented",
        "character": "Kalliane",
        "visualChange": "shoulder-length layered honey-blonde hair",
        "referenceStyle": "Monteiro arcade-fighter sprite art",
        "gameplay": "existing controls, movement semantics, power names and power concepts retained",
        "frameWidth": 320, "frameHeight": 256, "columns": 6, "framesPerPose": 6,
        "baseline": 248, "scale": round(scale, 5),
        "poseScale": POSE_SCALE,
        "frameOverrides": FRAME_OVERRIDES,
        "overrideHeight": OVERRIDE_HEIGHT,
        "groups": {group: f"atlases/kalliane-v2-{group}.webp" for group in FILES},
        "poses": POSES, "animationCount": 27, "uniqueFrameCount": 174,
        "overrides": {
            "walk": {"file": "atlases/kalliane-v2-walk12.webp", "frames": 12,
                     "frameRate": 18, "preview": "previews/walk-12frames.gif",
                     "frameDirectory": "frames/walk12/", "scale": round(walk_scale, 5)},
            "walkBack": {"file": "atlases/kalliane-v2-walkBack12.webp", "frames": 12,
                         "frameRate": 18, "preview": "previews/walk-back-12frames.gif",
                         "frameDirectory": "frames/walkBack12/", "scale": round(walk_scale, 5)},
        },
        "powers": {"special": "Proposta irresistível", "super": "Contrato Assinado!"},
        "references": ["portrait-v2.png (short-hair identity/outfit)", "../../monteiro/portrait.png (art style only)"],
        "tool": "Built-in ImageGen", "sourceFiles": "sources/", "preview": "preview.gif",
        "atlasFiles": "atlases/", "portrait": "portrait-v2.webp", "promptFile": "generation-prompts.json", "runtimeFilesModified": True,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    prompt_set = {
        "tool": "Built-in ImageGen",
        "referenceImages": {"Image 1": "Kalliane short-hair portrait: identity and outfit", "Image 2": "Monteiro portrait: art style and pose only"},
        "sharedPrompt": "Use case identity-preserve; production sprite atlas for Kalliane. Change only her hair to a neat shoulder-length layered honey-blonde bob with light curls. Preserve warm tan skin, dark eyes, black zip jacket with hot-magenta piping and small gold BBS crown, white shirt, blue lanyard and dark ID badge, black joggers with magenta side stripe and gold crown, black/magenta fingerless wraps, white-black-magenta sneakers. Polished hand-inked 1990s arcade-fighter art matching Monteiro, while Kalliane's identity and costume follow Image 1. Face right in three-quarter side view. Transparent RGBA landscape atlas; exact 6 columns × 4 rows, 24 complete full-body sprites in 256×256 cells; clear transparent gutters; stable scale and foot baseline; no cropping, overlap, extra figures, backdrop, floor, labels, watermark or extra limbs. Preserve existing movement semantics and power concepts.",
        "sequences": {
            **PROMPT_SEQUENCES,
            "walk12": "12 distinct phases; left heel contact, weight transfer, right heel lift, right foot passes hips, right knee swings forward, right heel contact, transfer, left heel lift, left foot passes hips, left knee swings forward, left toe extends, seamless return to frame 1. Alternate feet, show unique leg position in every frame.",
            "walkBack12": "12 distinct backward-walk phases, retreat to the left while head/chest face right; alternating rear-foot contacts, weight transfers, heel lifts, feet draw back under hips, knees bend and extend, stance stabilizes, seamless return to frame 1. No hops, running or attacks.",
        },
        "formatOverride": {
            "strong": "Transparent RGBA 2172×724 sheet; exact 6 columns × 2 rows for 12 full-body frames.",
            "walk12": "Transparent RGBA 1536×1024 sheet; exact 4 columns × 3 rows for 12 full-body frames.",
            "walkBack12": "Transparent RGBA 1536×1024 sheet; exact 4 columns × 3 rows for 12 full-body frames.",
            "portrait": "Transparent vertical full-body portrait in Kalliane's established outfit and short hair.",
        },
    }
    (OUT / "generation-prompts.json").write_text(json.dumps(prompt_set, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "README.txt").write_text(
        "Kalliane v2 implementada no jogo: cabelo curto e estilo visual inspirado em Monteiro; 27 animações / 174 quadros.\n"
        "Caminhada para frente e recuo andando usam 12 quadros cada. Controles e conceitos dos poderes foram preservados.\n"
        "Prévia: preview.gif; animações individuais: previews/*.gif.\n"
        "As imagens de origem estão em sources/ e os atlas montados em atlases/.\n",
        encoding="utf-8",
    )
    print(f"Kalliane v2 instalada: {OUT}; 27 animações, 174 quadros, escala {scale:.3f}.")


if __name__ == "__main__":
    main()
