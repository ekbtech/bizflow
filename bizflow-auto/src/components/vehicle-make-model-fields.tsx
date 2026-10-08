"use client";

import { useEffect, useRef, useState } from "react";
import {
  OTHER_VEHICLE_OPTION,
  vehicleMakes,
  vehicleModelsByMake,
  type CatalogVehicleMake,
} from "@/lib/vehicle-catalog";

type Props = {
  make?: string;
  model?: string;
};

function knownMake(value: string): value is CatalogVehicleMake {
  return Object.hasOwn(vehicleModelsByMake, value);
}

export function VehicleMakeModelFields({ make = "", model = "" }: Props) {
  const initialMake = knownMake(make) ? make : make ? OTHER_VEHICLE_OPTION : "";
  const initialModel = knownMake(make) && vehicleModelsByMake[make].some((entry) => entry === model)
    ? model
    : model ? OTHER_VEHICLE_OPTION : "";
  const [selectedMake, setSelectedMake] = useState(initialMake);
  const [customMake, setCustomMake] = useState(initialMake === OTHER_VEHICLE_OPTION ? make : "");
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const [customModel, setCustomModel] = useState(initialModel === OTHER_VEHICLE_OPTION ? model : "");
  const makeSelectRef = useRef<HTMLSelectElement>(null);
  const models = knownMake(selectedMake) ? vehicleModelsByMake[selectedMake] : [];

  useEffect(() => {
    const form = makeSelectRef.current?.closest("form");
    if (!form) return;
    const resetFields = () => {
      setSelectedMake(initialMake);
      setCustomMake(initialMake === OTHER_VEHICLE_OPTION ? make : "");
      setSelectedModel(initialModel);
      setCustomModel(initialModel === OTHER_VEHICLE_OPTION ? model : "");
    };
    form.addEventListener("reset", resetFields);
    return () => form.removeEventListener("reset", resetFields);
  }, [initialMake, initialModel, make, model]);

  function updateMake(value: string) {
    setSelectedMake(value);
    setCustomMake("");
    setSelectedModel("");
    setCustomModel("");
  }

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">Make</label>
        <select
          ref={makeSelectRef}
          aria-label="Vehicle make"
          required
          value={selectedMake}
          onChange={(event) => updateMake(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2"
        >
          <option value="">Select make</option>
          {vehicleMakes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          <option value={OTHER_VEHICLE_OPTION}>Other make</option>
        </select>
        {selectedMake === OTHER_VEHICLE_OPTION && (
          <input
            name="make"
            required
            maxLength={100}
            value={customMake}
            onChange={(event) => setCustomMake(event.target.value)}
            placeholder="Enter make"
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        )}
        {selectedMake !== OTHER_VEHICLE_OPTION && <input type="hidden" name="make" value={selectedMake} />}
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">Model / type</label>
        <select
          aria-label="Vehicle model or type"
          required
          value={selectedModel}
          onChange={(event) => {
            setSelectedModel(event.target.value);
            setCustomModel("");
          }}
          disabled={!selectedMake}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-50"
        >
          <option value="">{selectedMake ? "Select model / type" : "Select make first"}</option>
          {models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          <option value={OTHER_VEHICLE_OPTION}>Other model / type</option>
        </select>
        {selectedModel === OTHER_VEHICLE_OPTION && (
          <input
            name="model"
            required
            maxLength={100}
            value={customModel}
            onChange={(event) => setCustomModel(event.target.value)}
            placeholder="Enter model / type"
            className="w-full rounded-xl border border-slate-200 px-3 py-2"
          />
        )}
        {selectedModel !== OTHER_VEHICLE_OPTION && <input type="hidden" name="model" value={selectedModel} />}
      </div>
    </>
  );
}
