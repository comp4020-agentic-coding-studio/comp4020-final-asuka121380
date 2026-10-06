import { SCENES as TEMPLATES, type SceneTemplate } from "../../domain/scene.ts";
import { beach } from "./beach/info.ts";

// The scenes the site offers (ADR 0004). An entry is presentation only:
// title, words, cover and suggested colours. The kit, plot and reference
// stay in the domain template it names, and the scene's 3D surroundings load
// separately, so the homepage can list scenes without any of three.js.
// A second scene is a second entry here, not a redesign.

export interface SceneInfo {
  /** The domain template's id: what saved builds are keyed by. */
  id: string;
  title: string;
  /** A short line under the title: where and when. */
  setting: string;
  blurb: string;
  /** Under `public/`; a picture of the scene rendered by this project. */
  cover: string;
  coverAlt: string;
  /** Colour ids to offer first; every colour stays available. */
  suggestedColours: readonly string[];
}

export const SCENE_LIST: readonly SceneInfo[] = [beach];

export const sceneInfo = (id: string): SceneInfo | undefined => SCENE_LIST.find((s) => s.id === id);

export const templateOf = (info: SceneInfo): SceneTemplate => TEMPLATES[info.id];
