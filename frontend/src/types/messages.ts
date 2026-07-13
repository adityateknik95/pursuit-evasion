export type Vec3 = [number, number, number]

export interface AgentState {
  pos: Vec3
  vel: Vec3
}

export interface FrameMessage {
  type: 'frame'
  episode: number
  step: number
  time: number
  pursuer: AgentState
  evader: AgentState
  distance: number
  captured: boolean
  episode_over: boolean
  capture_count: number
  pursuer_reward: number
  evader_reward: number
  paused: boolean
  speed: number
  policy_mode: PolicyMode
  evader_mode: EvaderMode
  arena_size: number
  capture_radius: number
}

export interface StatusMessage {
  type: 'status'
  paused: boolean
  speed: number
  policy_mode: PolicyMode
  evader_mode: EvaderMode
  episode: number
  capture_count: number
  arena_size: number
  capture_radius: number
  model_loaded: boolean
  evader_model_loaded: boolean
}

export interface EpisodeEndMessage {
  type: 'episode_end'
  episode: number
  captured: boolean
  steps: number
  capture_count: number
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export type ServerMessage = FrameMessage | StatusMessage | EpisodeEndMessage | ErrorMessage

export type PolicyMode = 'ppo' | 'naive'

/** who drives the evader: the scripted potential-field controller or a learned policy */
export type EvaderMode = 'scripted' | 'ppo'

export type ClientMessage =
  | { type: 'reset'; pursuer_pos?: Vec3; evader_pos?: Vec3 }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set_speed'; value: number }
  | { type: 'set_policy_mode'; value: PolicyMode }
  | { type: 'set_evader_mode'; value: EvaderMode }

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/** 'auto' = director mode: slow wide orbit, smash-cut to chase cam when close */
export type CameraMode = 'free' | 'pursuer' | 'evader' | 'auto'

export type PlacementTarget = 'pursuer' | 'evader' | null
