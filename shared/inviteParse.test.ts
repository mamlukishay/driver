import { describe, expect, test } from "bun:test";
import { parseInviteReply } from "./inviteParse.ts";

const full = {
  title: "יום הולדת 7 לנועה",
  date: "2026-11-05",
  times: ["16:00", "18:30"],
  place: "פארק הירקון",
  address: "הירקון 1, תל אביב",
};

describe("parseInviteReply", () => {
  test("plain JSON with Hebrew strings kept as written", () => {
    expect(parseInviteReply(JSON.stringify(full))).toEqual(full);
  });

  test("fenced JSON", () => {
    expect(parseInviteReply("```json\n" + JSON.stringify(full) + "\n```")).toEqual(full);
  });

  test("prose around the object", () => {
    const text = `Sure! Here you go: ${JSON.stringify(full)}\nHope it helps {not json}.`;
    expect(parseInviteReply(text)).toEqual(full);
  });

  test("braces inside strings do not confuse extraction", () => {
    expect(parseInviteReply('{"title": "מסיבה {מיוחדת}", "date": "2026-11-05"}')).toEqual({
      title: "מסיבה {מיוחדת}",
      date: "2026-11-05",
    });
  });

  test("an already-parsed object is accepted", () => {
    expect(parseInviteReply(full)).toEqual(full);
  });

  test("invalid date is dropped, other fields kept", () => {
    expect(parseInviteReply('{"title":"x","date":"2026-02-31"}')).toEqual({ title: "x" });
    expect(parseInviteReply('{"title":"x","date":"05/11/2026"}')).toEqual({ title: "x" });
  });

  test("invalid times are filtered", () => {
    expect(parseInviteReply('{"times":["16:00","25:00","6pm","18:30"]}')).toEqual({ times: ["16:00", "18:30"] });
    expect(parseInviteReply('{"times":["late"]}')).toEqual({});
    expect(parseInviteReply('{"times":"16:00"}')).toEqual({});
  });

  test("missing fields and nulls give a partial result", () => {
    expect(parseInviteReply('{"title":"מסיבה","date":null,"times":null,"place":null,"address":null}')).toEqual({ title: "מסיבה" });
    expect(parseInviteReply("{}")).toEqual({});
  });

  test("wrong types are ignored", () => {
    expect(parseInviteReply('{"title":5,"place":["a"],"address":{}}')).toEqual({});
  });

  test("garbage yields an empty object", () => {
    for (const bad of ["", "no json here", "{broken", "[1,2]", '"str"', null, undefined, 42]) {
      expect(parseInviteReply(bad)).toEqual({});
    }
  });
});
