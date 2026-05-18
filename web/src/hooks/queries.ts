import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";

export const useBreedsQuery = () =>
  useQuery({ queryKey: ["breeds"], queryFn: api.fetchBreeds, staleTime: 60 * 60 * 1000 });

export const useDogsQuery = () =>
  useQuery({ queryKey: ["dogs"], queryFn: api.fetchDogs });

export const useFeedingsQuery = () =>
  useQuery({ queryKey: ["feeding_records"], queryFn: () => api.fetchFeedings() });

export const useAlertsQuery = () =>
  useQuery({ queryKey: ["alerts"], queryFn: api.fetchAlerts });

export const useDevicesQuery = () =>
  useQuery({ queryKey: ["devices"], queryFn: api.fetchDevices });
