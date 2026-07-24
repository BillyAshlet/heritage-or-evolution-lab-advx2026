class_name EvolutionBootstrap
extends Node

const BASE_MARGIN: int = 32

@onready var safe_area: MarginContainer = $UI/SafeArea
@onready var runtime_label: Label = $UI/SafeArea/Center/Panel/Content/Runtime


func _ready() -> void:
	get_viewport().size_changed.connect(_apply_safe_area)
	_apply_safe_area()
	var version: Dictionary = Engine.get_version_info()
	var version_string: String = str(version.get("string", "unknown"))
	runtime_label.text = "Native runtime ready · %s · Godot %s" % [
		OS.get_name(),
		version_string,
	]


func _apply_safe_area() -> void:
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	var window_size_i: Vector2i = DisplayServer.window_get_size()
	var display_safe_area: Rect2i = DisplayServer.get_display_safe_area()
	if window_size_i.x <= 0 or window_size_i.y <= 0 or display_safe_area.size == Vector2i.ZERO:
		_set_margins(BASE_MARGIN, BASE_MARGIN, BASE_MARGIN, BASE_MARGIN)
		return

	var scale: Vector2 = viewport_size / Vector2(window_size_i)
	var left: int = maxi(BASE_MARGIN, roundi(display_safe_area.position.x * scale.x))
	var top: int = maxi(BASE_MARGIN, roundi(display_safe_area.position.y * scale.y))
	var right_px: int = window_size_i.x - display_safe_area.end.x
	var bottom_px: int = window_size_i.y - display_safe_area.end.y
	var right: int = maxi(BASE_MARGIN, roundi(right_px * scale.x))
	var bottom: int = maxi(BASE_MARGIN, roundi(bottom_px * scale.y))
	_set_margins(left, top, right, bottom)


func _set_margins(left: int, top: int, right: int, bottom: int) -> void:
	safe_area.add_theme_constant_override("margin_left", left)
	safe_area.add_theme_constant_override("margin_top", top)
	safe_area.add_theme_constant_override("margin_right", right)
	safe_area.add_theme_constant_override("margin_bottom", bottom)
