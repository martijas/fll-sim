// Compiles SPIKE App Word Blocks (Scratch 3 project.json from .llsp3 scratch.sb3) into Python
// that runs on the simulated hub via the `blocks_rt` module. Generated code is readable so
// students can use "View as Python" to see what their blocks do.

import type { ScratchBlock, ScratchProject } from "@fll-sim/llsp3";

export interface CompileResult {
  python: string;
  warnings: string[];
  /** 1-based generated line -> block id, for mapping runtime errors back to blocks. */
  lineToBlock: Record<number, string>;
  /** Opcodes the compiler doesn't know (compiled as no-ops / 0). */
  unsupported: string[];
}

type Blocks = Record<string, ScratchBlock | unknown[]>;

interface Proc { name: string; params: Record<string, string>; argIds: string[] }

const py = (s: string) => JSON.stringify(s); // JSON string literals are valid Python literals for our content

function sanitize(s: string) {
  return s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1").slice(0, 40) || "x";
}

class Compiler {
  private blocks: Blocks;
  private out: { text: string; block?: string }[] = [];
  private indent = 0;
  private warnings: string[] = [];
  private unsupported = new Set<string>();
  private procs = new Map<string, Proc>();
  private curProc: Proc | null = null;
  private stackN = 0;

  constructor(private project: ScratchProject) {
    this.blocks = {};
    for (const t of project.targets) Object.assign(this.blocks, t.blocks);
  }

  // ---- helpers -------------------------------------------------------------
  private emit(text: string, block?: string) {
    this.out.push({ text: "    ".repeat(this.indent) + text, block });
  }
  private b(id: string | null | undefined): ScratchBlock | null {
    if (!id) return null;
    const x = this.blocks[id];
    return x && !Array.isArray(x) ? (x as ScratchBlock) : null;
  }
  private field(b: ScratchBlock, name: string): string {
    const f = b.fields[name];
    return f ? String(f[0] ?? "") : "";
  }
  private warn(msg: string) {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
  }

  /** Python expression for a block input (literal, reporter or menu shadow). */
  private input(b: ScratchBlock, name: string, fallback = "0"): string {
    const inp = b.inputs[name];
    if (!inp) return fallback;
    let v = inp[1] as unknown;
    if (v === null || v === undefined) v = inp[2];
    if (Array.isArray(v)) return this.primitive(v);
    if (typeof v === "string") return this.expr(v);
    return fallback;
  }
  private hasInput(b: ScratchBlock, name: string) {
    return !!b.inputs[name];
  }

  private primitive(p: unknown[]): string {
    const [type, value] = p as [number, unknown];
    switch (type) {
      case 4: case 5: case 6: case 7: case 8: {
        const s = String(value ?? "").trim();
        return /^-?\d+(\.\d+)?$/.test(s) ? s.replace(/^(-?)0+(\d)/, "$1$2") : py(String(value ?? ""));
      }
      case 9: case 10:
        return py(String(value ?? ""));
      case 11:
        return py(String(value ?? ""));
      case 12:
        return `V[${py(String(value))}]`;
      case 13:
        return `rt.list_str(Ls[${py(String(value))}])`;
      default:
        return py(String(value ?? ""));
    }
  }

  // ---- expressions ---------------------------------------------------------------
  private expr(id: string): string {
    const b = this.b(id);
    if (!b) {
      const raw = this.blocks[id];
      return Array.isArray(raw) ? this.primitive(raw) : "0";
    }
    const I = (n: string, f?: string) => this.input(b, n, f);
    const F = (n: string) => py(this.field(b, n));
    // Menu shadows: a single field whose value is the menu choice.
    if (b.shadow && Object.keys(b.inputs).length === 0) {
      const keys = Object.keys(b.fields);
      if (keys.length === 1) return py(this.field(b, keys[0]));
    }
    switch (b.opcode) {
      // operators
      case "operator_add": return `rt.add(${I("NUM1")}, ${I("NUM2")})`;
      case "operator_subtract": return `rt.sub(${I("NUM1")}, ${I("NUM2")})`;
      case "operator_multiply": return `rt.mul(${I("NUM1")}, ${I("NUM2")})`;
      case "operator_divide": return `rt.div(${I("NUM1")}, ${I("NUM2")})`;
      case "operator_mod": return `rt.mod(${I("NUM1")}, ${I("NUM2")})`;
      case "operator_random": return `rt.rnd(${I("FROM")}, ${I("TO")})`;
      case "operator_lt": return `rt.lt(${I("OPERAND1")}, ${I("OPERAND2")})`;
      case "operator_gt": return `rt.gt(${I("OPERAND1")}, ${I("OPERAND2")})`;
      case "operator_equals": return `rt.eq(${I("OPERAND1")}, ${I("OPERAND2")})`;
      case "operator_and": return `(rt.truthy(${I("OPERAND1", "False")}) and rt.truthy(${I("OPERAND2", "False")}))`;
      case "operator_or": return `(rt.truthy(${I("OPERAND1", "False")}) or rt.truthy(${I("OPERAND2", "False")}))`;
      case "operator_not": return `(not rt.truthy(${I("OPERAND", "False")}))`;
      case "operator_join": return `rt.join(${I("STRING1", '""')}, ${I("STRING2", '""')})`;
      case "operator_letter_of": return `rt.letter_of(${I("LETTER")}, ${I("STRING", '""')})`;
      case "operator_length": return `len(rt.tostr(${I("STRING", '""')}))`;
      case "operator_contains": return `rt.contains(${I("STRING1", '""')}, ${I("STRING2", '""')})`;
      case "operator_round": return `rt.round_(${I("NUM")})`;
      case "operator_mathop": return `rt.mathop(${F("OPERATOR")}, ${I("NUM")})`;
      case "flipperoperator_isInBetween": return `rt.between(${I("VALUE")}, ${I("LOW")}, ${I("HIGH")})`;
      // variables & lists
      case "data_variable": return `V[${F("VARIABLE")}]`;
      case "data_listcontents": return `rt.list_str(Ls[${F("LIST")}])`;
      case "data_itemoflist": return `rt.list_item(Ls[${F("LIST")}], ${I("INDEX")})`;
      case "data_itemnumoflist": return `rt.list_index(Ls[${F("LIST")}], ${I("ITEM")})`;
      case "data_lengthoflist": return `len(Ls[${F("LIST")}])`;
      case "data_listcontains": return `rt.list_contains(Ls[${F("LIST")}], ${I("ITEM")})`;
      case "argument_reporter_string_number":
      case "argument_reporter_boolean": {
        const name = this.field(b, "VALUE");
        const p = this.curProc?.params[name];
        return p ?? "0";
      }
      // motors
      case "flippermotor_absolutePosition": return `rt.motor_position(${I("PORT")})`;
      case "flippermotor_speed": return `rt.motor_speed(${I("PORT")})`;
      case "flippermoremotor_position": return `rt.motor_relative(${I("PORT")})`;
      case "flippermoremotor_power": return `rt.motor_power(${I("PORT")})`;
      // sensors
      case "flippersensors_isColor": return `rt.is_color(${I("PORT")}, ${I("VALUE")})`;
      case "flippersensors_color": return `rt.color(${I("PORT")})`;
      case "flippersensors_isReflectivity": return `rt.compare(rt.reflection(${I("PORT")}), ${I("COMPARATOR", '"="')}, ${I("VALUE")})`;
      case "flippersensors_reflectivity": return `rt.reflection(${I("PORT")})`;
      case "flippersensors_isPressed": return `rt.is_pressed(${I("PORT")}, ${I("OPTION", '"pressed"')})`;
      case "flippersensors_force": return `rt.force(${I("PORT")}, ${this.unit(b, '"newton"')})`;
      case "flippersensors_isDistance": return `rt.compare(rt.distance(${I("PORT")}, ${this.unit(b, '"cm"')}), ${I("COMPARATOR", '"<"')}, ${I("VALUE")})`;
      case "flippersensors_distance": return `rt.distance(${I("PORT")}, ${this.unit(b, '"cm"')})`;
      case "flippersensors_isTilted": return `rt.is_tilted(${I("VALUE", '"any"')})`;
      case "flippersensors_isorientation": return `rt.is_orientation(${I("VALUE", this.fieldOr(b, "VALUE", '"top"'))})`;
      case "flippersensors_ismotion": return "False";
      case "flippersensors_orientationAxis": return `rt.orientation_axis(${this.fieldOr(b, "AXIS", I("AXIS", '"yaw"'))})`;
      case "flippersensors_buttonIsPressed": return `rt.button_is(${I("BUTTON", this.fieldOr(b, "BUTTON", '"left"'))}, ${I("EVENT", this.fieldOr(b, "EVENT", '"pressed"'))})`;
      case "flippersensors_timer": return "rt.timer()";
      case "flippermoresensors_rawColor": return `rt.raw_color(${I("PORT")}, ${I("COLOR", this.fieldOr(b, "COLOR", '"red"'))})`;
      case "flippermoresensors_acceleration": return `rt.acceleration(${I("AXIS", this.fieldOr(b, "AXIS", '"x"'))})`;
      case "flippermoresensors_angularVelocity": return `rt.angular_velocity(${I("AXIS", this.fieldOr(b, "AXIS", '"x"'))})`;
      case "flippermoresensors_orientation": return "rt.hub_orientation()";
      case "flippermoresensors_motion": return "-1";
      case "flippermusic_getTempo": return "60";
      case "sound_volume": return "100";
      default:
        this.unsupported.add(b.opcode);
        this.warn(`Unsupported reporter "${b.opcode}" is treated as 0`);
        return "0";
    }
  }

  private fieldOr(b: ScratchBlock, name: string, fallback: string) {
    return b.fields[name] ? py(this.field(b, name)) : fallback;
  }
  private unit(b: ScratchBlock, fallback: string) {
    return b.fields.UNIT ? py(this.field(b, "UNIT")) : this.hasInput(b, "UNIT") ? this.input(b, "UNIT") : fallback;
  }

  // ---- statements --------------------------------------------------------------
  private stack(firstId: string | null | undefined) {
    const start = this.out.length;
    let id = firstId;
    while (id) {
      const b = this.b(id);
      if (!b) break;
      this.stmt(id, b);
      id = b.next;
    }
    if (this.out.length === start) this.emit("pass");
  }

  private sub(b: ScratchBlock, name: string) {
    const inp = b.inputs[name];
    this.indent++;
    this.stack(inp ? (inp[1] as string | null) : null);
    this.indent--;
  }

  private stmt(id: string, b: ScratchBlock) {
    const I = (n: string, f?: string) => this.input(b, n, f);
    const F = (n: string) => py(this.field(b, n));
    const e = (s: string) => this.emit(s, id);
    switch (b.opcode) {
      // ---- control
      case "control_wait": e(`await rt.wait_s(${I("DURATION")})`); break;
      case "control_repeat":
        e(`for _ in range(int(rt.num(${I("TIMES")}))):`);
        this.sub(b, "SUBSTACK");
        this.indent++; e("await rt.tick()"); this.indent--;
        break;
      case "control_forever":
        e("while True:");
        this.sub(b, "SUBSTACK");
        this.indent++; e("await rt.tick()"); this.indent--;
        break;
      case "control_repeat_until":
        e(`while not rt.truthy(${I("CONDITION", "False")}):`);
        this.sub(b, "SUBSTACK");
        this.indent++; e("await rt.tick()"); this.indent--;
        break;
      case "control_if":
        e(`if rt.truthy(${I("CONDITION", "False")}):`);
        this.sub(b, "SUBSTACK");
        break;
      case "control_if_else":
        e(`if rt.truthy(${I("CONDITION", "False")}):`);
        this.sub(b, "SUBSTACK");
        e("else:");
        this.sub(b, "SUBSTACK2");
        break;
      case "control_wait_until": e(`await rt.until(lambda: rt.truthy(${I("CONDITION", "False")}))`); break;
      case "flippercontrol_stopOtherStacks": e("rt.stop_other_stacks()"); break;
      case "flippercontrol_stop":
      case "control_stop": {
        const opt = (this.field(b, "STOP_OPTION") || "all").toLowerCase();
        if (opt.includes("this")) e("return");
        else if (opt.includes("other")) e("rt.stop_other_stacks()");
        else e("rt.stop_all()");
        break;
      }
      // ---- events
      case "event_broadcast": e(`rt.broadcast(${I("BROADCAST_INPUT", '""')})`); break;
      case "event_broadcastandwait": e(`await rt.broadcast_wait(${I("BROADCAST_INPUT", '""')})`); break;
      // ---- motors
      case "flippermotor_motorTurnForDirection": e(`await rt.motor_turn_for(${I("PORT")}, ${I("DIRECTION", '"clockwise"')}, ${I("VALUE")}, ${this.unit(b, '"rotations"')})`); break;
      case "flippermotor_motorGoDirectionToPosition": e(`await rt.motor_go_to_position(${I("PORT")}, ${I("DIRECTION", '"shortest"')}, ${I("POSITION")})`); break;
      case "flippermotor_motorStartDirection": e(`rt.motor_start(${I("PORT")}, ${I("DIRECTION", '"clockwise"')})`); break;
      case "flippermotor_motorStop": e(`rt.motor_stop(${I("PORT")})`); break;
      case "flippermotor_motorSetSpeed": e(`rt.set_motor_speed(${I("PORT")}, ${I("SPEED")})`); break;
      case "flippermoremotor_motorGoToRelativePosition": e(`await rt.motor_go_to_relative(${I("PORT")}, ${I("POSITION")}, ${I("SPEED", "75")})`); break;
      case "flippermoremotor_motorSetDegreeCounted": e(`rt.motor_set_relative(${I("PORT")}, ${I("VALUE")})`); break;
      case "flippermoremotor_motorStartPower": e(`rt.motor_start_power(${I("PORT")}, ${I("POWER")})`); break;
      case "flippermoremotor_motorSetStopMethod": e(`rt.set_stop_method(${I("PORT")}, ${I("STOP", this.fieldOr(b, "STOP", '"brake"'))})`); break;
      case "flippermoremotor_motorSetAcceleration": e(`rt.set_motor_acceleration(${I("PORT")}, ${I("ACCELERATION", this.fieldOr(b, "ACCELERATION", '"medium"'))})`); break;
      // ---- movement
      case "flippermove_move": e(`await rt.move(${I("DIRECTION", '"forward"')}, ${I("VALUE")}, ${this.unit(b, '"cm"')})`); break;
      case "flippermove_startMove": e(`rt.start_move(${I("DIRECTION", '"forward"')})`); break;
      case "flippermove_steer": e(`await rt.steer(${I("STEERING")}, ${I("VALUE")}, ${this.unit(b, '"cm"')})`); break;
      case "flippermove_startSteer": e(`rt.start_steer(${I("STEERING")})`); break;
      case "flippermove_stopMove": e("rt.stop_move()"); break;
      case "flippermove_movementSpeed": e(`rt.set_movement_speed(${I("SPEED")})`); break;
      case "flippermove_setMovementPair": e(`rt.set_movement_pair(${I("PAIR", '"AB"')})`); break;
      case "flippermove_setDistance": e(`rt.set_distance(${I("DISTANCE")}, ${this.unit(b, '"cm"')})`); break;
      case "flippermoremove_startDualSpeed": e(`rt.start_dual_speed(${I("LEFT")}, ${I("RIGHT")})`); break;
      case "flippermoremove_movementSetStopMethod": e(`rt.set_movement_stop(${I("STOP", this.fieldOr(b, "STOP", '"brake"'))})`); break;
      case "flippermoremove_movementSetAcceleration": e(`rt.set_movement_acceleration(${I("ACCELERATION", this.fieldOr(b, "ACCELERATION", '"medium"'))})`); break;
      // ---- sensors
      case "flippersensors_resetYaw": e("rt.reset_yaw()"); break;
      case "flippersensors_resetTimer": e("rt.reset_timer()"); break;
      case "flippermoresensors_setOrientation": e("pass  # set hub sensor orientation: not modelled yet"); break;
      // ---- light
      case "flipperlight_lightDisplayImageOnForTime": e(`await rt.matrix_on_for(${I("MATRIX", '""')}, ${I("VALUE")})`); break;
      case "flipperlight_lightDisplayImageOn": e(`rt.matrix_on(${I("MATRIX", '""')})`); break;
      case "flipperlight_lightDisplayText": e(`await rt.matrix_write(${I("TEXT", '""')})`); break;
      case "flipperlight_lightDisplayOff":
      case "flipperdisplay_lightDisplayOff": e("rt.matrix_off()"); break;
      case "flipperlight_lightDisplaySetBrightness": e(`rt.matrix_brightness(${I("BRIGHTNESS")})`); break;
      case "flipperlight_lightDisplaySetPixel": e(`rt.matrix_set_pixel(${I("X")}, ${I("Y")}, ${I("BRIGHTNESS")})`); break;
      case "flipperlight_lightDisplayRotate": e(`rt.matrix_rotate(${I("DIRECTION", '"clockwise"')})`); break;
      case "flipperlight_lightDisplaySetOrientation": e(`rt.matrix_orientation(${I("ORIENTATION", '"upright"')})`); break;
      case "flipperlight_centerButtonLight": e(`rt.center_light(${I("COLOR")})`); break;
      case "flipperlight_ultrasonicLightUp": e(`rt.distance_lights(${I("PORT")}, ${I("VALUE", '"100 100 100 100"')})`); break;
      case "flipperlight_lightColorMatrixImageOn":
      case "flipperlight_lightColorMatrixImageOnForTime":
      case "flipperlight_lightColorMatrixOff":
      case "flipperlight_lightColorMatrixSetBrightness":
      case "flipperlight_lightColorMatrixSetPixel":
      case "flipperlight_lightColorMatrixRotate":
      case "flipperlight_lightColorMatrixSetOrientation":
        e("pass  # 3x3 Color Matrix not modelled yet");
        this.warn("3x3 Color Matrix blocks are ignored (device not modelled yet)");
        break;
      // ---- sound
      case "flippersound_beepForTime": e(`await rt.beep_for(${I("NOTE", "60")}, ${I("DURATION", "0.2")})`); break;
      case "flippersound_beep": e(`rt.beep(${I("NOTE", "60")})`); break;
      case "flippersound_stopSound": e("rt.stop_sound()"); break;
      case "flippersound_playSoundUntilDone":
      case "flippersound_playSound": e(`rt.app("sound.play", ${I("SOUND", '""')})`); break;
      case "sound_changeeffectby": case "sound_seteffectto": case "sound_cleareffects":
      case "sound_changevolumeby": case "sound_setvolumeto":
        e("pass  # app sound effect"); break;
      // ---- app panels
      case "displaymonitor_displayWrite": e(`rt.app("display.text", ${I("TEXT", '""')})`); break;
      case "displaymonitor_displayWriteForTime": e(`rt.app("display.text", ${I("TEXT", '""')})`); e(`await rt.wait_s(${I("VALUE", "1")})`); break;
      case "linegraphmonitor_lineGraphAddTo": e(`rt.app("line.plot", ${I("COLOR", '"red"')}, rt.timer(), ${I("VALUE")})`); break;
      case "bargraphmonitor_barGraphSetValue": e(`rt.app("bar.set", ${I("COLOR", '"red"')}, ${I("VALUE")})`); break;
      case "bargraphmonitor_barGraphChangeValue": e(`rt.app("bar.change", ${I("COLOR", '"red"')}, ${I("VALUE")})`); break;
      // ---- variables & lists
      case "data_setvariableto": e(`V[${F("VARIABLE")}] = ${I("VALUE", '""')}`); break;
      case "data_changevariableby": e(`rt.change_var(V, ${F("VARIABLE")}, ${I("VALUE")})`); break;
      case "data_showvariable": case "data_hidevariable": case "data_showlist": case "data_hidelist": e("pass"); break;
      case "data_addtolist": e(`rt.list_add(Ls[${F("LIST")}], ${I("ITEM", '""')})`); break;
      case "data_deleteoflist": e(`rt.list_delete(Ls[${F("LIST")}], ${I("INDEX")})`); break;
      case "data_deletealloflist": e(`Ls[${F("LIST")}].clear()`); break;
      case "data_insertatlist": e(`rt.list_insert(Ls[${F("LIST")}], ${I("INDEX")}, ${I("ITEM", '""')})`); break;
      case "data_replaceitemoflist": e(`rt.list_replace(Ls[${F("LIST")}], ${I("INDEX")}, ${I("ITEM", '""')})`); break;
      // ---- my blocks
      case "procedures_call": {
        const proccode = String(b.mutation?.proccode ?? "");
        const proc = this.procs.get(proccode);
        if (!proc) {
          this.warn(`My Block "${proccode}" has no definition`);
          e("pass");
          break;
        }
        const args = proc.argIds.map((aid) => this.input(b, aid, '""'));
        e(`await ${proc.name}(${args.join(", ")})`);
        break;
      }
      default:
        this.unsupported.add(b.opcode);
        this.warn(`Unsupported block "${b.opcode}" is skipped`);
        e(`pass  # unsupported: ${b.opcode}`);
    }
  }

  // ---- hats -----------------------------------------------------------------------
  private hatRegistration(b: ScratchBlock, fn: string): string | null {
    const I = (n: string, f?: string) => this.input(b, n, f);
    const on = (cond: string) => `rt.on_condition(lambda: ${cond}, ${fn})`;
    switch (b.opcode) {
      case "flipperevents_whenProgramStarts": return `rt.on_start(${fn})`;
      case "flipperevents_whenColor": return on(`rt.is_color(${I("PORT")}, ${I("OPTION", I("VALUE"))})`);
      case "flipperevents_whenPressed": return on(`rt.is_pressed(${I("PORT")}, ${I("OPTION", '"pressed"')})`);
      case "flipperevents_whenDistance": return on(`rt.compare(rt.distance(${I("PORT")}, ${this.unit(b, '"cm"')}), ${I("COMPARATOR", '"<"')}, ${I("VALUE")})`);
      case "flipperevents_whenTilted": return on(`rt.is_tilted(${I("VALUE", '"any"')})`);
      case "flipperevents_whenOrientation": return on(`rt.is_orientation(${I("VALUE", '"top"')})`);
      case "flipperevents_whenGesture": this.warn("Hub gestures (shake/tap/fall) are not simulated yet"); return on("False");
      case "flipperevents_whenButton": return on(`rt.button_is(${I("BUTTON", this.fieldOr(b, "BUTTON", '"left"'))}, ${I("EVENT", this.fieldOr(b, "EVENT", '"pressed"'))})`);
      case "flipperevents_whenTimer": return on(`rt.gt(rt.timer(), ${I("VALUE")})`);
      case "flipperevents_whenCondition": return on(`rt.truthy(${I("CONDITION", "False")})`);
      case "event_whenbroadcastreceived": return `rt.on_broadcast(${py(this.field(b, "BROADCAST_OPTION"))}, ${fn})`;
      default: return null;
    }
  }

  compile(): CompileResult {
    this.emit("# Generated from Word Blocks by FLL Sim — edit the blocks, not this file.");
    this.emit("import blocks_rt as rt");
    this.emit("");
    const vars: Record<string, unknown> = {};
    const lists: Record<string, unknown[]> = {};
    for (const t of this.project.targets) {
      for (const [, [name, value]] of Object.entries(t.variables ?? {})) vars[name] = value;
      for (const [, [name, value]] of Object.entries(t.lists ?? {})) lists[name] = value;
    }
    this.emit(`V = ${pyDict(vars)}`);
    this.emit(`Ls = ${pyDict(lists)}`);
    this.emit("");

    const tops = Object.entries(this.blocks).filter(([, b]) => !Array.isArray(b) && (b as ScratchBlock).topLevel) as [string, ScratchBlock][];
    // Sort stacks top-to-bottom, left-to-right like the canvas.
    tops.sort(([, a], [, b]) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

    // My Blocks first (so calls can resolve).
    let pn = 0;
    for (const [, b] of tops) {
      if (b.opcode !== "procedures_definition") continue;
      const proto = this.b(b.inputs.custom_block?.[1] as string);
      const m = proto?.mutation ?? {};
      const proccode = String(m.proccode ?? `proc${pn}`);
      const argIds: string[] = JSON.parse(String(m.argumentids ?? "[]"));
      const argNames: string[] = JSON.parse(String(m.argumentnames ?? "[]"));
      const params: Record<string, string> = {};
      argNames.forEach((n, i) => (params[n] = `a${i}_${sanitize(n)}`));
      this.procs.set(proccode, { name: `my_${sanitize(proccode.replace(/%[sbn]/g, ""))}_${pn++}`, params, argIds });
    }
    for (const [id, b] of tops) {
      if (b.opcode !== "procedures_definition") continue;
      const proto = this.b(b.inputs.custom_block?.[1] as string);
      const proc = this.procs.get(String(proto?.mutation?.proccode ?? ""));
      if (!proc) continue;
      this.curProc = proc;
      this.emit(`async def ${proc.name}(${Object.values(proc.params).join(", ")}):  # My Block: ${proto?.mutation?.proccode}`, id);
      this.indent++;
      this.stack(b.next);
      this.indent--;
      this.emit("");
      this.curProc = null;
    }

    const regs: string[] = [];
    for (const [id, b] of tops) {
      if (b.opcode === "procedures_definition") continue;
      const fn = `stack_${++this.stackN}`;
      const reg = this.hatRegistration(b, fn);
      if (!reg) continue; // loose blocks without a hat never run
      this.emit(`async def ${fn}():  # ${b.opcode.replace(/^flipperevents_|^event_/, "")}`, id);
      this.indent++;
      this.stack(b.next);
      this.indent--;
      this.emit("");
      regs.push(reg);
    }
    for (const r of regs) this.emit(r);
    this.emit("rt.run()");

    const lineToBlock: Record<number, string> = {};
    this.out.forEach((l, i) => {
      if (l.block) lineToBlock[i + 1] = l.block;
    });
    if (!regs.length) this.warnings.push("No hat blocks (e.g. “When program starts”): nothing will run.");
    return { python: this.out.map((l) => l.text).join("\n") + "\n", warnings: this.warnings, lineToBlock, unsupported: [...this.unsupported] };
  }
}

function pyValue(v: unknown): string {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (Array.isArray(v)) return `[${v.map(pyValue).join(", ")}]`;
  const s = String(v ?? "");
  return /^-?\d+(\.\d+)?$/.test(s) ? s.replace(/^(-?)0+(\d)/, "$1$2") : py(s);
}

function pyDict(o: Record<string, unknown>): string {
  const e = Object.entries(o);
  if (!e.length) return "{}";
  return `{${e.map(([k, v]) => `${py(k)}: ${pyValue(v)}`).join(", ")}}`;
}

export function compileBlocks(project: ScratchProject): CompileResult {
  return new Compiler(project).compile();
}
export { projectToXml, xmlToProject, emptyProject, programTarget } from "./xml";
