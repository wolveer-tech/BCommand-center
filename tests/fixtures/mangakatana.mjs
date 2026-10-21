export const searchHtml=`<div id="book_list">
 <div class="item" data-id="42"><div class="media"><a href="/manga/test-story.42"><img src="/imgs/cover/a/cover.jpg" alt="[Cover]"></a><div class="status ongoing">Ongoing</div></div><div class="text"><h3 class="title"><a href="/manga/test-story.42">Test &amp; Story</a><span> - Update chapter 10</span></h3><div class="summary">A <b>story</b>.</div></div></div>
 <div class="item"><h3 class="title"><a href="/manga/test-story.42">Duplicate</a></h3></div>
 <div class="item"><h3 class="title"><a href="https://mangakatana.com.attacker.test/manga/untrusted.1">Bad host</a></h3></div>
 <div class="item"><a href="/manga/second-story.43"><img lazy-src="https://attacker.test/a.jpg"></a><h3 class="title"><a href="/manga/second-story.43">Second &#x26; Story</a></h3></div>
 </div><div id="hot_book"><div class="item"><h3 class="title"><a href="/manga/sidebar.2">Sidebar</a></h3></div></div>
 <script>const injected='<div class="item"><h3><a href="/manga/script.4">Script</a></h3></div>';</script>`;
export const chaptersHtml=`<div id="single_book"><h1 class="heading">Test &amp; Story</h1>
 <a href="/manga/test-story.42/c10">Chapter 10: A test</a><a href="/manga/test-story.42/c2.5">Chapter 2.5: Bonus &amp; more</a><a href="/manga/test-story.42/c0">Chapter 0</a><a href="/manga/test-story.42/c10">Duplicate</a>
 <a href="/manga/other-title.43/c1">Chapter 1</a><a href="https://other.test/manga/test-story.42/c2">Chapter 2</a>
 <a href="/manga/test-story.42/c2?ad=yes">Chapter 2</a><script>const x='<a href="/manga/test-story.42/c8">Chapter 8</a>';</script></div>`;
export const pagesHtml=String.raw`<script>var ytaw=['https://i1.mangakatana.com/token/preview/0.jpg'];
 var thzq=['https:\/\/i1.mangakatana.com/token/test%3At/0.jpg','https://i1.mangakatana.com/token/test%3At/1.jpg','https://i1.mangakatana.com/token/test%3At/1.jpg',];
 throw new Error('This upstream code must never run');</script><div id="imgs"><img data-src="#"></div><img src="https://ads.test/banner.jpg">`;
