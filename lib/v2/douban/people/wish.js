const querystring = require('querystring');
const cheerio = require('cheerio');
const got = require('@/utils/got');
const config = require('@/config').value;
module.exports = async (ctx) => {
    const userid = ctx.params.userid;
    const routeParams = querystring.parse(ctx.params.routeParams);

    let userName;

    const pageSize = 15;
    const pagesCount = routeParams.pagesCount ? Number.parseInt(routeParams.pagesCount) : null;
    const type = routeParams.type || 'all';

    if (!pagesCount) {
        const initialUrl = `https://movie.douban.com/people/${userid}/wish?start=0&type=${type}`;
        const initialResponse = await ctx.cache.tryGet(
            initialUrl,
            async () => {
                const _r = await got({
                    method: 'GET',
                    url: initialUrl,
                    headers: {
                        Referer: initialUrl,
                        Cookie: config.douban.cookie || '',
                    },
                });
                return _r.data;
            },
            config.cache.routeExpire,
            false
        );

        const $initial = cheerio.load(initialResponse);
        const subjectNumText = $initial('span.subject-num').text().trim();
        const totalItemsMatch = subjectNumText.match(/\d+/g);
        if (totalItemsMatch && totalItemsMatch.length > 2) {
            totalItems = parseInt(totalItemsMatch[2], 10);
        }

        pagesCount = Math.ceil(totalItems / pageSize);
    }
    
    const tasks = [];
    for (let page = 0; page < pagesCount; page += 1) {
        const url = `https://movie.douban.com/people/${userid}/wish?start=${page * pageSize}&type=${type}`;

        tasks.push(
            ctx.cache
                .tryGet(
                    url,
                    async () => {
                        const _r = await got({
                            method: 'GET',
                            url,
                            headers: {
                                Referer: url,
                                Cookie: config.douban.cookie || '',
                            },
                        });
                        return _r.data;
                    },
                    config.cache.routeExpire,
                    false
                )
                .then((data) => {
                    const $ = cheerio.load(data);
                    const list = $('div.article > div.grid-view > div.item');
                    userName = userName || $('div.side-info-txt > h3').text();

                    if (list) {
                        return Promise.all(
                            list.get().map((item) => {
                                item = $(item);
                                const itemPicUrl = item.find('.pic a img').attr('src');
                                const info = item.find('.info');
                                const title = info.find('ul li.title a em').text();
                                const url = info.find('ul li.title a').attr('href');
                                // const title_ = title.split('/').find((title) => title.trim());
                                const title_ = title.replaceAll('/', '');
                                const day = info.find('ul li .date').text().trim();
                                const rssItem = {
                                    title: title_,
                                    description: `${info.find('.intro').text()}<br><img src="${itemPicUrl}">`,
                                    link: url,
                                    pubDate: new Date(day),
                                };

                                return rssItem;
                            })
                        );
                    }
                })
        );
    }

    const items = (await Promise.all(tasks)).flat();
    ctx.state.data = {
        title: `豆瓣想看 - ${userName || userid}`,
        link: `https://movie.douban.com/people/${userid}/wish`,
        item: items,
    };
};
