import { useState, useMemo, useEffect, memo, useCallback } from "react";
import { Search, Store, Coffee, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Business, Member } from "@/lib/types";

interface BusinessSelectorProps {
  businesses: Business[];
  member: Member;
  onSelect: (business: Business) => void;
}

const categoryIcons: Record<string, JSX.Element> = {
  food: <UtensilsCrossed className="w-5 h-5" />,
  retail: <ShoppingBag className="w-5 h-5" />,
  cafe: <Coffee className="w-5 h-5" />,
  default: <Store className="w-5 h-5" />,
};

const BusinessButton = memo(function BusinessButton({
  business,
  onSelect,
  isFavorite,
}: {
  business: Business;
  onSelect: (business: Business) => void;
  isFavorite?: boolean;
}) {
  return (
    <button
      data-testid={`button-${isFavorite ? "fav-" : ""}business-${business.id}`}
      onClick={() => onSelect(business)}
      className={`rounded-xl p-4 flex flex-col items-center gap-2 border transition-all active:scale-[0.98] min-h-[80px] ${
        isFavorite
          ? "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200 hover:border-emerald-300 hover:shadow-md"
          : "bg-white border-stone-200 hover:border-stone-300 hover:shadow-sm"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isFavorite
            ? "bg-emerald-100 text-emerald-600"
            : "bg-stone-100 text-stone-600"
        }`}
      >
        {categoryIcons[business.category || "default"] || categoryIcons.default}
      </div>
      <p className="font-medium text-stone-900 text-center text-sm leading-tight line-clamp-2">
        {business.name}
      </p>
    </button>
  );
});

export function BusinessSelector({
  businesses,
  member,
  onSelect,
}: BusinessSelectorProps) {
  const [search, setSearch] = useState("");
  const [topBusinesses, setTopBusinesses] = useState<string[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);

  useEffect(() => {
    async function loadTopBusinesses() {
      try {
        const cacheKey = `favorites_${member.id}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
          const { businesses: cached, timestamp } = JSON.parse(cachedData);
          const ageInHours = (Date.now() - timestamp) / (1000 * 60 * 60);

          if (ageInHours < 24) {
            setTopBusinesses(cached);
            setIsLoadingFavorites(false);
            return;
          }
        }

        setIsLoadingFavorites(true);

        const { data, error } = await supabase
          .from("transactions")
          .select("business_id")
          .eq("member_id", member.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          setIsLoadingFavorites(false);
          return;
        }

        if (data && data.length > 0) {
          const businessCounts: Record<string, number> = {};
          for (const transaction of data) {
            if (transaction.business_id) {
              businessCounts[transaction.business_id] =
                (businessCounts[transaction.business_id] || 0) + 1;
            }
          }

          const sortedBusinesses = Object.entries(businessCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([businessId]) => businessId);

          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              businesses: sortedBusinesses,
              timestamp: Date.now(),
            })
          );

          setTopBusinesses(sortedBusinesses);
        }
      } catch (error) {
        console.error("[kiosk] Failed to load top businesses:", error);
      } finally {
        setIsLoadingFavorites(false);
      }
    }

    loadTopBusinesses();
  }, [member.id]);

  const { topBusinessesList, allOtherBusinesses } = useMemo(() => {
    const top = businesses.filter((b) => topBusinesses.includes(b.id));
    top.sort(
      (a, b) => topBusinesses.indexOf(a.id) - topBusinesses.indexOf(b.id)
    );

    const others = businesses.filter((b) => !topBusinesses.includes(b.id));
    others.sort((a, b) => a.name.localeCompare(b.name));

    return { topBusinessesList: top, allOtherBusinesses: others };
  }, [businesses, topBusinesses]);

  const filteredTopBusinesses = useMemo(() => {
    if (!search) return topBusinessesList;
    const searchLower = search.toLowerCase();
    return topBusinessesList.filter(
      (business) =>
        business.name.toLowerCase().includes(searchLower) ||
        business.description?.toLowerCase().includes(searchLower)
    );
  }, [topBusinessesList, search]);

  const filteredOtherBusinesses = useMemo(() => {
    if (!search) return allOtherBusinesses;
    const searchLower = search.toLowerCase();
    return allOtherBusinesses.filter(
      (business) =>
        business.name.toLowerCase().includes(searchLower) ||
        business.description?.toLowerCase().includes(searchLower)
    );
  }, [allOtherBusinesses, search]);

  const hasTopBusinesses = filteredTopBusinesses.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="text-center mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-stone-900">
          Select Business
        </h2>
        <p className="text-stone-500 text-xs">
          Where are you making a purchase?
        </p>
      </div>

      <div className="mb-4 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            data-testid="input-business-search"
            type="text"
            placeholder="Search businesses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 text-sm pl-10 pr-4 rounded-lg bg-white border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 transition-all"
          />
          {search && (
            <button
              data-testid="button-clear-business-search"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4 -mx-1 px-1">
        {(hasTopBusinesses || isLoadingFavorites) && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1 mb-2">
              Your favorites
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {isLoadingFavorites
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="bg-stone-100 rounded-xl p-4 min-h-[80px] animate-pulse"
                    />
                  ))
                : filteredTopBusinesses.map((business) => (
                    <BusinessButton
                      key={business.id}
                      business={business}
                      onSelect={onSelect}
                      isFavorite
                    />
                  ))}
            </div>
          </div>
        )}

        {filteredOtherBusinesses.length > 0 && (
          <div>
            {hasTopBusinesses && (
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1 mb-2">
                All businesses
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {filteredOtherBusinesses.map((business) => (
                <BusinessButton
                  key={business.id}
                  business={business}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}

        {filteredTopBusinesses.length === 0 &&
          filteredOtherBusinesses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-3">
                <Search className="w-5 h-5 text-stone-400" />
              </div>
              <p className="text-stone-500 text-sm" data-testid="text-no-businesses">
                No businesses found
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
