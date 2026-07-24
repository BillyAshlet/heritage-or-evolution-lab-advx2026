class_name GameController
extends Node

signal phase_changed(previous: GamePhase.Value, current: GamePhase.Value)
signal level_changed(previous_index: int, current_index: int)
signal exhibit_restarted

var current_phase: GamePhase.Value = GamePhase.Value.TUNING
var current_level_index: int = 0


func start_round() -> bool:
	return _transition(GamePhase.Value.TUNING, GamePhase.Value.RUNNING)


func finish_round() -> bool:
	return _transition(GamePhase.Value.RUNNING, GamePhase.Value.VERDICT)


func seal_generation() -> bool:
	return _transition(GamePhase.Value.VERDICT, GamePhase.Value.INHERIT)


func advance_round(next_level_index: int) -> bool:
	if next_level_index <= current_level_index:
		push_error("GameController: next level index must increase")
		return false
	if not _transition(GamePhase.Value.INHERIT, GamePhase.Value.TUNING):
		return false
	var previous_index: int = current_level_index
	current_level_index = next_level_index
	level_changed.emit(previous_index, current_level_index)
	return true


func restart_exhibit() -> void:
	var previous_phase: GamePhase.Value = current_phase
	var previous_level_index: int = current_level_index
	current_phase = GamePhase.Value.TUNING
	current_level_index = 0
	if previous_phase != current_phase:
		phase_changed.emit(previous_phase, current_phase)
	if previous_level_index != current_level_index:
		level_changed.emit(previous_level_index, current_level_index)
	exhibit_restarted.emit()


func _transition(expected: GamePhase.Value, target: GamePhase.Value) -> bool:
	if current_phase != expected:
		push_error(
			"GameController: illegal transition %s → %s; expected current phase %s"
			% [
				GamePhase.display_name(current_phase),
				GamePhase.display_name(target),
				GamePhase.display_name(expected),
			]
		)
		return false
	var previous: GamePhase.Value = current_phase
	current_phase = target
	phase_changed.emit(previous, current_phase)
	return true

