extends GutTest


func test_round_report_enforces_accounting_invariant() -> void:
	var report: RoundReport = RoundReport.new()
	report.initial = 30
	report.survivors = 18
	report.deaths_eaten = 7
	report.deaths_starved = 5
	report.final_traits = TraitsSpec.new()
	assert_true(report.is_consistent())

	report.deaths_starved = 4
	assert_false(report.is_consistent())


func test_lineage_accepts_complete_generations_in_order() -> void:
	var report: RoundReport = RoundReport.new()
	report.initial = 30
	report.survivors = 20
	report.deaths_eaten = 4
	report.deaths_starved = 6
	report.final_traits = TraitsSpec.new()

	var level: LevelSpec = LevelSpec.new()
	level.id = &"l1-famine"
	level.label = "L1 饥荒"
	level.plankton = PlanktonSpec.new()
	level.prey_fish = PopulationSpec.new()
	level.rival_fish = PopulationSpec.new()
	level.dressing = DressingSpec.new()

	var record: GenerationRecord = GenerationRecord.new()
	record.gen = 1
	record.traits_before = TraitsSpec.new()
	record.traits_after = TraitsSpec.new()
	record.level = level
	record.verdict = &"survived"
	record.report = report

	var lineage: Lineage = Lineage.new()
	assert_true(lineage.append(record))
	assert_eq(lineage.size(), 1)
	assert_eq(lineage.records()[0], record)

