import { fetchWeather } from "../lib/tools/weather";
import { fetchRate } from "../lib/tools/fx";
import { fetchSearch } from "../lib/tools/search";

const weather = await fetchWeather({ city: "Zagreb", countryCode: "HR", days: 3 });
console.log("weather:", JSON.stringify(weather, null, 2));

const fx = await fetchRate({ from: "EUR", to: "USD", amount: 100 });
console.log("fx:", JSON.stringify(fx, null, 2));

const search = await fetchSearch({ query: "best time to visit Croatia", recency: "year" });
console.log("search:", JSON.stringify(search, null, 2));

console.log("\n— negative cases, all must be ok:false —\n");

const t = Date.now();
console.log("digits:", await fetchSearch({
  query: "visa rules passport 123456789012", recency: "any",
}));
console.log("elapsed ms:", Date.now() - t);

console.log("email:", await fetchSearch({
  query: "email pavle@example.com about visa rules", recency: "any",
}));

console.log("bad currency:", await fetchRate({
  from: "EURO", to: "USD", amount: null,
} as never));

console.log("days out of range:", await fetchWeather({
  city: "Kotor", countryCode: null, days: 99,
} as never));

console.log("\n— cache, same process —\n");
const a = await fetchRate({ from: "EUR", to: "USD", amount: 100 });
const b = await fetchRate({ from: "EUR", to: "USD", amount: 100 });
console.log("same fetchedAt:", a.fetchedAt === b.fetchedAt);

console.log("\n— geocoding resolution —\n");
console.log(JSON.stringify(
  await fetchWeather({ city: "Springfield", countryCode: null, days: 1 }),
  null, 2
));
