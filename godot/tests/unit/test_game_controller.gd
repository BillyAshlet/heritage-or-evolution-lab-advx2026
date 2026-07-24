extends GutTest

var controller: GameController


func before_each() -> void:
	controller = GameController.new()
	add_child_autofree(controller)


func test_starts_at_first_level_tuning() -> void:
	assert_eq(controller.current_phase, GamePhase.Value.TUNING)
	assert_eq(controller.current_level_index, 0)


func test_runs_the_constitutional_phase_sequence() -> void:
	assert_true(controller.start_round())
	assert_eq(controller.current_phase, GamePhase.Value.RUNNING)
	assert_true(controller.finish_round())
	assert_eq(controller.current_phase, GamePhase.Value.VERDICT)
	assert_true(controller.seal_generation())
	assert_eq(controller.current_phase, GamePhase.Value.INHERIT)
	assert_true(controller.advance_round(1))
	assert_eq(controller.current_phase, GamePhase.Value.TUNING)
	assert_eq(controller.current_level_index, 1)


func test_restart_returns_to_first_level_tuning() -> void:
	assert_true(controller.start_round())
	assert_true(controller.finish_round())
	controller.restart_exhibit()
	assert_eq(controller.current_phase, GamePhase.Value.TUNING)
	assert_eq(controller.current_level_index, 0)

