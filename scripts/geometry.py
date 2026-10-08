"""共用的墙厚、横向折返楼梯和尺寸计算，单位为毫米。"""
import math


def stair_geometry(p):
    half_risers = p["stair_risers"] // 2
    run = (half_risers - 1) * p["stair_tread"]
    right = p["site_width"] - p["exterior_wall_thickness"] - 40
    turn = right - p["stair_landing_depth"]
    start = turn - run
    front = p["courtyard_depth"] + p["exterior_wall_thickness"] + 180
    fw, gap = p["stair_flight_width"], p["stair_gap"]
    back = front + 2 * fw + gap
    entry = start - p["stair_landing_depth"]
    rise = p["floor_to_floor"] / p["stair_risers"]
    return {
        "direction": "west-east-west", "entry_space": "porch",
        "bounds": [start, front, right, back], "entry_x": entry,
        "turn_x": turn, "flight_width": fw, "gap": gap,
        "rise": p["floor_to_floor"], "riser_count": p["stair_risers"],
        "riser_height": rise, "tread_depth": p["stair_tread"],
        "flight_clear_width": fw - 50, "landing_depth": p["stair_landing_depth"],
        "slope_degrees": round(math.degrees(math.atan(rise / p["stair_tread"])), 2),
        "upper_hole": [start, front - 40, right, back + 40],
        "evidence": "inferred", "source": "用户最新确认从门廊上楼，取消厅堂直通楼梯的敞口；左右折返走向保留，踏步与平台尺寸为设计建议"
    }


def add_space_measurements(plan, p):
    """空间沿分间线分配；另算扣墙后的矩形范围，不将它冒充实测净面积。"""
    w, y0, y1 = p["site_width"], p["courtyard_depth"], p["courtyard_depth"] + p["house_depth"]
    for space in plan["spaces"]:
        xs, ys = zip(*space["polygon"])
        xmin, ymin, xmax, ymax = min(xs), min(ys), max(xs), max(ys)
        clear = [xmin, ymin, xmax, ymax]
        for wall in plan["walls"]:
            a, b, half = wall["a"], wall["b"], wall["thickness"] / 2
            if a[0] == b[0] and min(a[1], b[1]) < ymax and max(a[1], b[1]) > ymin:
                x = a[0]
                if abs(x - xmin) < .01: clear[0] = max(clear[0], x + half)
                if abs(x - xmax) < .01: clear[2] = min(clear[2], x - half)
                if xmin == 0 and wall["id"] == "west-house": clear[0] = p["exterior_wall_thickness"]
                if xmax == w and wall["id"] == "east-house": clear[2] = w - p["exterior_wall_thickness"]
            if a[1] == b[1] and min(a[0], b[0]) < xmax and max(a[0], b[0]) > xmin:
                y = a[1]
                if abs(y - ymin) < .01: clear[1] = max(clear[1], y + half)
                if abs(y - ymax) < .01: clear[3] = min(clear[3], y - half)
                if ymin == y0 and wall["id"].startswith("south-"): clear[1] = y0 + p["exterior_wall_thickness"]
                if ymax == y1 and wall["id"] == "north-house": clear[3] = y1 - p["exterior_wall_thickness"]
        space["dimension_basis"] = p["dimension_basis"]
        space["nominal_size_mm"] = [xmax - xmin, ymax - ymin]
        space["clear_bounds_mm"] = clear
        space["clear_size_mm"] = [round(clear[2] - clear[0]), round(clear[3] - clear[1])]
        space["clear_size_note"] = "按当前墙厚估算的可用矩形范围；未扣柱和装饰层，非竣工净尺寸"
