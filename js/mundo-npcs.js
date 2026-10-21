/* Mundo vivo: rotinas dos NPCs, rotas, passagem de dias, viagens e atividades por local. */

function recordWorldEvent(kind, title, detail) {
  S.worldEvents = Array.isArray(S.worldEvents) ? S.worldEvents : [];
  const event = { day: S.day, kind, title, detail };
  S.worldEvents.push(event);
  S.worldEvents = S.worldEvents.slice(-12);
  save();
  return event;
}

function recentWorldEvent() {
  return (S.worldEvents || []).at(-1) || null;
}

function reactToWorldEvent(id, n) {
  const event = recentWorldEvent();
  if (!event || S.day - event.day > 14) return;
  const w = ew();
  w.heard = w.heard || {};
  const eventKey = `${event.day}:${event.kind}:${event.title}`;
  if (w.heard[id] == eventKey || Math.random() >= 0.45) return;
  w.heard[id] = eventKey;
  const line =
    event.kind == "failure"
      ? `Soube do que aconteceu em “${event.title}”. A equipe ainda precisa de ajuda.`
      : event.kind == "rescue"
        ? `Ouvi que você resgatou um aliado em “${event.title}”. Isso importa para a vila.`
        : event.kind == "civilians"
          ? `Os moradores comentam que você protegeu civis em “${event.title}”.`
          : `A vila está comentando sua missão “${event.title}”.`;
  log(`<b>${n[0]}:</b> “${line}”`, "sys");
}

function worldDay() {
  const season = SEASONS[Math.floor((S.ageDays || 0) / 30) % SEASONS.length];
  S.season = season.name;
  S.weather = P(season.weather);
  log(`🌦️ ${S.season}: ${S.weather}.`, "sys");
  if (S.socialEvent && S.day - S.socialEvent.day >= 2) {
    S.socialCooldown[S.socialEvent.npc] = S.day;
    S.socialEvent = null;
  }
  expirePromises();
  if (!S.assignment) {
    const activityBusy = !!(S.activeContract || M || B || X);
    if (!activityBusy) {
      if (S.urgent) {
        S.urgent.daysLeft--;
        if (S.urgent.daysLeft <= 0) missUrgent(S.urgent);
      }
      if (!S.urgent) {
        const candidates = CRISES.filter(
          (event) =>
            MSK.indexOf(event.rank) >= MSK.indexOf("B") &&
            event.id != S.lastUrgent &&
            S.rk >= NEED[event.rank] &&
            (() => {
              const req = LOC_REQ[event.loc];
              return !req || (S.rk >= req.rk && S.done >= req.done);
            })(),
        );
        const chance =
          S.weather == "Tempestade"
            ? 0.32
            : S.weather == "Chuva forte"
              ? 0.24
              : 0.13;
        if (candidates.length && Math.random() < chance) {
          const event = P(candidates);
          S.urgent = { ...event, daysLeft: 3 };
          S.lastUrgent = event.id;
          log(
            `🚨 Chamado urgente em ${L[event.loc][1]}: <b>${event.title}</b>. Você tem três dias para chegar e ajudar.`,
            "bt",
          );
        }
      }
      if (
        !S.urgent &&
        S.rk >= 1 &&
        S.day >= 4 &&
        S.day - (S.lastAssignmentDay || 0) >= 4 &&
        Math.random() < 0.16 + Math.min(0.2, (S.rep || 0) / 500)
      )
        offerHokageMission();
      if (
        !S.assignment &&
        !S.urgent &&
        !S.socialEvent &&
        Math.random() < 0.12 + Math.min(0.18, (S.rep || 0) / 500)
      )
        offerNpcEvent();
    }
  }
}

function go(k) {
  if (!L[k]) return log("Esse destino não existe no mapa.", "sys");
  if (academyStudent() && k != "academia") {
    log(
      "📚 Você ainda não se formou. Iruka pede que conclua as aulas e o exame antes de sair da Academia.",
      "sys",
    );
    return render();
  }
  const req = LOC_REQ[k];
  if (req && (S.rk < req.rk || S.done < req.done)) {
    log(
      `🔒 Acesso bloqueado. Requer rank ${RK[req.rk]} e ${req.done} missões concluídas.`,
      "sys",
    );
    return render();
  }
  S.loc = k;
  tick(1);
  mode = "map";
  log(`🚶 Você segue para <b>${L[k][1]}</b>.`, "sys");
  if (Math.random() < 0.25) ev();
  render();
}

function ev() {
  const r = R(1, 6);
  if (r == 1) {
    const y = R(10, 40);
    S.ryo += y;
    log(`💰 Você encontra ${y} ryo no chão!`);
  } else if (r == 2) {
    const foe =
      S.loc == "onda" || S.loc == "ponte"
        ? "gato"
        : S.loc == "som"
          ? "dosu"
          : S.loc == "akatsuki"
            ? "obito"
            : P(["ladrao", "lobo", "renegado"]);
    log("⚠️ Um inimigo aparece no caminho!", "bad");
    fight(EN[foe], {});
  } else if (r == 3)
    log(
      P([
        "🗣️ Ouve rumores sobre movimentações da Akatsuki.",
        "🗣️ Dizem que Naruto devorou 12 tigelas de ramen hoje.",
        "🗣️ Um mercador comenta que a Hokage busca novos ninjas.",
      ]),
      "sys",
    );
  else if (r == 4) {
    gain(6);
    log("🥷 Um ninja de passagem corrige sua postura. (+6 XP)");
  } else if (r == 5) {
    const witnesses = pres(S.loc);
    if (witnesses.length) {
      const id = P(witnesses);
      rel(id, 2);
      log(
        `🤝 Você ajuda ${N[id][0]} com uma tarefa simples. A confiança entre vocês aumenta.`,
        "ok",
      );
    } else
      log("🍃 O vento muda e nuvens escuras se acumulam no horizonte.", "sys");
  } else {
    const damage = R(4, 10);
    S.hp = Math.max(1, S.hp - damage);
    log(
      `🌧️ O terreno escorregadio causa uma queda. Você perde ${damage} HP.`,
      "bad",
    );
  }
}

const hs = (...a) => {
  let h = 2166136261;
  for (const c of a.join("|")) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
};

function ew() {
  S.wd = S.wd || {};
  ["away", "hurt", "dead"].forEach((k) => (S.wd[k] = S.wd[k] || {}));
  S.lp = S.lp || {};
  S.fame = S.fame || 0;
  S.rep = S.rep || 0;
  Object.keys(S.wd.dead).forEach((id) => {
    const i = EXTEAM.indexOf(id);
    if (i >= 0) EXTEAM.splice(i, 1);
    S.team = (S.team || []).filter((m) => m != id);
  });
  return S.wd;
}

const locsOf = (id) => Object.keys(L).filter((k) => L[k][2].includes(id));

const homeOf = (id) => {
  const ks = locsOf(id);
  return ks.some((k) => REG[k] == "k") ? "k" : REG[ks[0]];
};

function npcRoutine(id, locations) {
  if (NPC_SCHEDULES[id]) return NPC_SCHEDULES[id];
  if (ROT[id])
    return ROT[id].map((places, t) =>
      places.length
        ? places[Math.floor(hs(id, "routine", t) * places.length)]
        : null,
    );
  const w = ew();
  w.routines = w.routines || {};
  if (!w.routines[id]) {
    const seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    w.routines[id] = [0, 1, 2].map(
      (t) => locations[(seed + t) % locations.length],
    );
  }
  return w.routines[id];
}

function scheduledWhere(id, d = S.day, t = S.t) {
  const w = ew(),
    timeSlot = d * 3 + t;
  if (w.dead[id]) return null;
  if (S.assignment?.status == "active" && S.assignment.squad?.includes(id))
    return null;
  if (M && (S.team || []).includes(id)) return null;
  const h = w.hurt[id];
  if (h && timeSlot < h.until) return homeOf(id) == "k" ? "hospital" : null;
  const a = w.away[id];
  if (a) {
    if (d == a.from && t == 0) return "portao";
    if (d == a.until && t == 1) return "portao";
    if (d >= a.from && d <= a.until) return null;
  }
  const cs = locsOf(id).filter((k) => REG[k] == homeOf(id));
  if (!cs.length) return null;
  const eventText = `${S.urgent?.title || ""} ${M?.m?.[1] || ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
    villageCrisis = /invas|ataque.{0,30}konoha|evacuacao de konoha/.test(
      eventText,
    ),
    storyDefense = M?.story?.arcId == "konohadefesa" && M.story.stageIndex >= 1;
  if (
    (villageCrisis || storyDefense) &&
    [
      "tsunade",
      "kakashi",
      "shikamaru",
      "sakura",
      "shizune",
      "yamato",
      "sai",
    ].includes(id)
  )
    return "torre";
  if (
    (villageCrisis || storyDefense) &&
    ["naruto", "lee", "kiba", "hinata", "neji", "tenten", "shino"].includes(id)
  )
    return "portao";
  const routine = npcRoutine(id, cs);
  return routine[t] || null;
}

function routeNeighbors(location) {
  const region = REG[location],
    hub = ROUTE_HUB[region],
    neighbors = new Set(ROUTE_LINKS[location] || []);
  if (hub) {
    if (location == hub)
      Object.keys(REG)
        .filter((place) => REG[place] == region && place != hub)
        .forEach((place) => neighbors.add(place));
    else neighbors.add(hub);
  }
  if (worldConsequences().regions.onda.bridge == "completed") {
    if (location == "fronteira") neighbors.add("ponte");
    if (location == "ponte") neighbors.add("fronteira");
  }
  return [...neighbors];
}

function routePath(from, to) {
  if (from == to) return [from];
  const queue = [[from]],
    visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift(),
      last = path[path.length - 1];
    for (const next of routeNeighbors(last)) {
      if (visited.has(next)) continue;
      const candidate = [...path, next];
      if (next == to) return candidate;
      visited.add(next);
      queue.push(candidate);
    }
  }
  return null;
}

function advanceNpcTravel() {
  const w = ew();
  w.position = w.position || {};
  w.travel = w.travel || {};
  for (const id of Object.keys(N)) {
    if (S.assignment?.status == "active" && S.assignment.squad?.includes(id)) {
      w.position[id] = S.assignment.loc;
      delete w.travel[id];
      continue;
    }
    if (M && (S.team || []).includes(id)) {
      w.position[id] = S.loc;
      delete w.travel[id];
      continue;
    }
    const target = scheduledWhere(id);
    if (!target) {
      if (!w.away[id]) {
        delete w.position[id];
        delete w.travel[id];
      }
      continue;
    }
    if (!w.position[id]) {
      w.position[id] = target;
      continue;
    }
    if (w.position[id] == target) {
      delete w.travel[id];
      continue;
    }
    const path = routePath(w.position[id], target);
    if (!path || path.length < 2) {
      w.position[id] = target;
      delete w.travel[id];
      continue;
    }
    w.position[id] = path[1];
    if (w.position[id] == target) delete w.travel[id];
    else w.travel[id] = { to: target, remaining: path.length - 2 };
  }
}

function where(id) {
  const target = scheduledWhere(id);
  if (!target) return null;
  const w = ew();
  w.position = w.position || {};
  if (!w.position[id]) w.position[id] = target;
  return w.position[id];
}

function pres(l) {
  return Object.keys(N).filter((id) => where(id) == l);
}

function hurtNpc(id, grave) {
  const w = ew();
  if (w.dead[id]) return;
  w.hurt[id] = { until: slot() + R(6, 12), grave: !!grave };
  delete w.away[id];
}

function die(id, why) {
  const w = ew(),
    n = N[id];
  w.dead[id] = S.day;
  delete w.hurt[id];
  delete w.away[id];
  delete (S.promises || {})[id];
  S.team = (S.team || []).filter((m) => m != id);
  if (S.rs) delete S.rs[id];
  log(`🕯️ <b>${n[0]} morreu</b> (${why}). Konoha está de luto.`, "bad");
  RELS.filter((r) => r[0] == id || r[1] == id).forEach((r) => {
    const o = r[0] == id ? r[1] : r[0];
    if (N[o] && !w.dead[o]) {
      remember(o, "luto", `${n[0]} morreu.`, { trust: -1 });
      log(`${N[o][0]} está abalado(a) com a perda de ${n[0]}.`, "sys");
    }
  });
  if (S.assignment?.squad)
    S.assignment.squad = S.assignment.squad.filter((m) => m != id);
  if (S.urgent?.npc == id) {
    S.urgent = null;
    log("O chamado ligado a " + n[0] + " foi cancelado.", "sys");
  }
  S.pres = {};
}

function daySim() {
  const w = ew();
  Object.keys(w.hurt).forEach((id) => {
    const h = w.hurt[id];
    if (slot() < h.until) return;
    const med = ["tsunade", "shizune", "haruka", "sakura"].filter(
      (i) => !w.dead[i],
    ).length;
    if (h.grave && MORTAL.includes(id) && Math.random() < 0.14 - 0.03 * med)
      die(id, "não resistiu aos ferimentos");
    else {
      delete w.hurt[id];
      log(`🏥 ${N[id][0]} recebeu alta do hospital.`, "sys");
    }
  });
  Object.keys(w.away).forEach((id) => {
    const a = w.away[id];
    if (S.day > a.until) return delete w.away[id];
    const p = { B: 0.03, A: 0.07, S: 0.12 }[a.rank];
    if (p && S.day > a.from && Math.random() < p) {
      const grave = a.rank != "B" && Math.random() < 0.35;
      hurtNpc(id, grave);
      log(
        `🗣️ Notícia: ${N[id][0]} voltou ferido(a) de uma missão rank ${a.rank}${grave ? " e o estado é grave" : ""}.`,
        "sys",
      );
    }
  });
  Object.keys(AWAYR).forEach((id) => {
    if (
      !N[id] ||
      w.dead[id] ||
      w.away[id] ||
      w.hurt[id] ||
      S.assignment?.squad?.includes(id) ||
      Math.random() >= AWAYR[id]
    )
      return;
    w.away[id] = {
      from: S.day,
      until: S.day + R(2, 4),
      rank: P(["C", "C", "B", "B", "A"]),
    };
  });
  if (
    S.urgent &&
    (S.assignment?.status == "active" || S.activeContract || M || B || X)
  ) {
    S.urgent.daysLeft--;
    if (S.urgent.daysLeft <= 0) missUrgent(S.urgent);
  }
  if (
    !S.hokage &&
    S.rk == 3 &&
    S.rep >= 99.5 &&
    S.fame >= 60 &&
    S.done >= 45 &&
    S.worldYears >= 4 &&
    S.lv >= 20
  ) {
    S.hokage = true;
    log(
      "🏯 <b>O conselho da vila e Tsunade reconhecem sua trajetória: você é nomeado(a) o Hokage de Konoha!</b>",
      "ok",
    );
  }
}

const lockedLoc = (k) => {
  const q = LOC_REQ[k];
  return q && (S.rk < q.rk || S.done < q.done);
};

function travelTo(k) {
  if (!L[k]) return log("Esse destino não existe no mapa.", "sys");
  if (academyStudent() && k != "academia") return go(k);
  if (lockedLoc(k)) return go(k);
  const path = routePath(S.loc, k);
  if (!path) return log("Não há uma rota conhecida para esse destino.", "sys");
  if (path.length < 2) return log("Você já está nesse local.", "sys");
  const distance = path.length - 1;
  mode = "map";
  for (let i = 1; i < path.length; i++) {
    S.loc = path[i];
    tick(1);
  }
  log(
    `🚶 Você chegou a <b>${L[k][1]}</b> após ${distance} ${distance == 1 ? "período" : "períodos"} de viagem.`,
    "sys",
  );
  if (Math.random() < 0.25) ev();
  if (distance > 1 && Math.random() < 0.3 && !B) {
    log("⚠️ Você é emboscado(a) na estrada!", "bad");
    fight(EN[P(["ladrao", "lobo", "renegado"])]);
    return;
  }
  selLoc = null;
  save();
  render();
}

/* ----- Atividades por local ----- */
const fat = (n) => (S.fatigue = Math.min(100, (S.fatigue || 0) + n)),
  heal = (n) => (S.hp = Math.min(S.mh, S.hp + n)),
  rep1 = () => (S.rep = Math.min(100, (S.rep || 0) + 1)),
  WATER = ["onda", "ponte", "cachoeira", "nevoa", "onsen"];

const ACTS = [
  [
    "onsen",
    "♨️ Banho termal",
    "20 ryō · zera a fadiga e cura",
    () => {
      if (S.ryo < 20) return log("Você não tem ryō suficiente.", "sys");
      S.ryo -= 20;
      S.fatigue = 0;
      S.hp = S.mh;
      S.ck = Math.min(S.mc, S.ck + 20);
      return "Você relaxa nas águas quentes e se sente renovado(a).";
    },
  ],
  [
    "cachoeira",
    "💧 Meditar sob a cachoeira",
    "Chakra cheio · chance rara de +1 chakra máximo",
    () => {
      S.ck = S.mc;
      fat(5);
      gain(15);
      if (Math.random() < 0.06) {
        S.mc++;
        return "Sua mente silencia: o chakra máximo aumentou em 1! (+15 XP)";
      }
      return "A água gelada clareia sua mente. (+15 XP)";
    },
  ],
  [
    "arena",
    "⚔️ Duelo amistoso",
    "Combate contra um duelista da arena",
    () => {
      fight([
        "Duelista da Arena",
        50 + S.lv * 9,
        6 + S.lv,
        P(["", "fogo", "agua", "vento"]),
      ]);
      return -1;
    },
  ],
  [
    "monumento",
    "🕯️ Homenagear os heróis",
    "+1 reputação · +8 XP",
    () => {
      rep1();
      gain(8);
      return "Você lê os nomes gravados e reflete sobre o Fogo da Vontade.";
    },
  ],
  [
    "floresta",
    "🌿 Coletar ervas e caçar",
    "Ryō e chance de kit médico",
    () => {
      fat(8);
      const y = R(20, 55);
      S.ryo += y;
      if (Math.random() < 0.3) {
        S.kit++;
        return `Você vende caça (+${y} ryō) e prepara um kit médico.`;
      }
      return `Você vende caça e ervas por ${y} ryō.`;
    },
  ],
  [
    "mercado",
    "📦 Bico de entregador",
    "25–50 ryō",
    () => {
      fat(6);
      const y = R(25, 50);
      S.ryo += y;
      return `Você entrega pacotes pela vila e ganha ${y} ryō.`;
    },
  ],
  [
    "torre",
    "🗂️ Ajudar na papelada",
    "+30 ryō · +1 reputação",
    () => {
      S.ryo += 30;
      rep1();
      return "Shizune agradece a ajuda com os relatórios.";
    },
  ],
  [
    "portao",
    "🛡️ Patrulhar o portão",
    "+1 reputação · +12 XP · pode haver combate",
    () => {
      rep1();
      gain(12);
      fat(6);
      if (Math.random() < 0.2) {
        fight(EN[P(["ladrao", "lobo"])]);
        return -1;
      }
      return "A patrulha termina sem incidentes.";
    },
  ],
  [
    "hospital",
    "🩺 Voluntariar-se",
    "+1 reputação · +15 ryō · +10 XP",
    () => {
      rep1();
      S.ryo += 15;
      gain(10);
      return "Você ajuda a cuidar dos feridos.";
    },
  ],
  [
    "ichiraku",
    "🍜 Desafio das tigelas",
    "15 ryō · cura bastante",
    () => {
      if (S.ryo < 15) return log("Você não tem ryō suficiente.", "sys");
      S.ryo -= 15;
      heal(50);
      fat(-10);
      if (Math.random() < 0.05) {
        S.mh++;
        return "Teuchi aplaude! Sua vitalidade máxima aumentou em 1.";
      }
      return "Você devora o ramen e recupera as forças!";
    },
  ],
  [
    WATER,
    "🎣 Pescar",
    "15–35 ryō · chance de pílula",
    () => {
      fat(4);
      const y = R(15, 35);
      S.ryo += y;
      if (Math.random() < 0.15) {
        S.pill++;
        return `Você pesca uma carpa dourada: +${y} ryō e uma pílula!`;
      }
      return `Boa pescaria: +${y} ryō.`;
    },
  ],
  [
    ["chuva", "nuvem", "nevoa", "templo"],
    "🧭 Investigar a região",
    "Rumores, ryō ou encontros",
    () => {
      const r = Math.random();
      if (r < 0.25) {
        fight(EN[P(["renegado", "kiri", "som"])]);
        return -1;
      }
      if (r < 0.55) {
        const y = R(40, 90);
        S.ryo += y;
        return `Você faz um trabalho local por ${y} ryō.`;
      }
      gain(25);
      return "Moradores contam histórias e rumores da guerra. (+25 XP)";
    },
  ],
  [
    "*",
    "🧭 Explorar os arredores",
    "Pode render ryō, itens, XP ou combate",
    () => {
      const r = Math.random();
      if (r < 0.2) {
        fight(EN[P(["ladrao", "lobo", "renegado"])]);
        return -1;
      }
      if (r < 0.5) {
        const y = R(20, 60);
        S.ryo += y;
        fat(5);
        return `Você encontra uma bolsa esquecida: +${y} ryō.`;
      }
      if (r < 0.65) {
        S.kit++;
        return "Entre as pedras, você acha um kit médico.";
      }
      gain(15);
      return "Você descobre uma trilha antiga. (+15 XP)";
    },
  ],
];

const actHere = () =>
  ACTS.map((a, i) => ({ a, i })).filter(
    ({ a }) =>
      a[0] == "*" ||
      a[0] == S.loc ||
      (Array.isArray(a[0]) && a[0].includes(S.loc)),
  );

function doAct(i) {
  S.acts = S.acts || {};
  if (S.acts[i] == S.day)
    return log("Você já fez isso hoje. Volte amanhã.", "sys");
  if (academyStudent()) return log("📚 Conclua a Academia antes.", "sys");
  const res = ACTS[i][3]();
  if (!res) return render();
  S.acts[i] = S.day;
  tick(1);
  if (res !== -1) log(res, "ok");
  save();
  render();
}
