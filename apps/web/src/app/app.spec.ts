import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { App } from "./app";

describe("Application shell", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it("shows a successful API connection in the shell", async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne("/api/health")
      .flush({ status: "ok" });
    await fixture.whenStable();
    const shell: HTMLElement = fixture.nativeElement;
    expect(shell.querySelector('[role="status"]')?.textContent).toContain(
      "Połączono z serwerem",
    );
    expect(shell.querySelector("h1")?.textContent).toContain("PawTrace");
  });

  it("lets the user reconnect after a failed health request", async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne("/api/health")
      .flush("Unavailable", { status: 503, statusText: "Unavailable" });
    await fixture.whenStable();
    const shell: HTMLElement = fixture.nativeElement;
    expect(shell.querySelector('[role="status"]')?.textContent).toContain(
      "Serwer jest niedostępny",
    );
    shell.querySelector("button")?.click();
    http.expectOne("/api/health").flush({ status: "ok" });
    await fixture.whenStable();
    expect(shell.querySelector('[role="status"]')?.textContent).toContain(
      "Połączono z serwerem",
    );
  });
});
