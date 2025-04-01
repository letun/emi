import { attachMedia, refresh } from "@app/ui";
import { getThumbnailUrl } from "@app/storage";
import { Heap } from "@app/heap";

// Images table
const ImagesTable = Heap.Table("image", {
    filename: Heap.String(),
    image: Heap.ImageFile(),
    sessionId: Heap.String(),
    title: Heap.NonRequired(Heap.String(), ""),
    description: Heap.NonRequired(Heap.String(), ""),
    rating: Heap.NonRequired(Heap.Integer(), 1200),
});

// Rating table
const ImagesRating = Heap.Table("rating", {
    id1: Heap.String(),
    id2: Heap.String(),
    result: Heap.Number(), // 1 win, 0 loss
});

/**
 * Images list and upload button screen
 */
app.screen("/", async (ctx, req) => {
    let records = await ImagesTable.findAll(ctx, {
        where: {
            sessionId: ctx.session?.id,
        },
    });

    const countImages = await ImagesTable.countBy(ctx, {
        sessionId: ctx.session?.id,
    });

    const allowCompare = countImages > 2;

    return (
        <screen title="File manager">
            <text class="section">Select image file to upload</text>

            {records.map((record) => (
                <list-item
                    icon={{ url: record.image.getThumbnailUrl(100) }}
                    content={{
                        title: record.filename + " (" + record.rating + ")",
                        subTitle: record.createdAt.toLocaleDateString(),
                    }}
                    onClick={cardRoute({ id: record.id }).navigate()}
                />
            ))}

            <section>
                <button
                    class="primary"
                    onClick={attachMedia({
                        mediaType: "photo",
                        submitUrl: uploadRoute.url(),
                    })}
                >
                    Upload
                </button>

                {allowCompare && (
                    <button
                        style={{ marginTop: 20 }}
                        onClick={ctx.router.navigate("/compare")}
                        class={"secondary"}
                    >
                        Compare
                    </button>
                )}
            </section>
        </screen>
    );
});

/**
 * Action: File uploader
 */
const uploadRoute = app.apiCall("/upload", async (ctx, req) => {
    await ImagesTable.create(ctx, {
        sessionId: ctx.session.id,
        filename: req.body.file.name,
        image: req.body.file.hash,
    });
    return refresh();
});

/**
 * Screen: Record card screen
 */
const cardRoute = app.screen("/record/:id", async (ctx, req) => {
    const imageId = req.params.id;
    const record = await ImagesTable.getById(ctx, imageId);

    return (
        <screen title={record.title || record.filename}>
            <image src={record.image.getThumbnailSrc(800)} />

            <section>
                <text style={{ marginTop: 20 }}>
                    Текущий рейтинг: {record.rating}
                </text>

                <text style={{ marginTop: 20 }}>Название картинки:</text>
                <text-input
                    name="title"
                    formId="formImageDataSubmit"
                    placeholder="Введите название"
                    initialValue={record.title}
                />

                <text style={{ marginTop: 20 }}>Описание:</text>
                <text-input
                    name="description"
                    initialValue={record.description}
                    formId="formImageDataSubmit"
                    placeholder="Введите описание"
                    multiline={true}
                />

                <button
                    class="primary"
                    style={{ marginTop: 20 }}
                    title="Сохранить изменения"
                    onClick={{
                        type: "submitForm",
                        formId: "formImageDataSubmit",
                        url: updateImageDataRoute.url(),
                        params: {
                            id: imageId,
                        },
                    }}
                />

                <button
                    style={{ marginTop: 20 }}
                    onClick={removeImageRoute.apiCall({
                        id: imageId,
                    })}
                    class="danger"
                >
                    Удалить
                </button>
                <button
                    style={{ marginTop: 30 }}
                    onClick={ctx.router.navigate("/")}
                    class="secondary"
                >
                    Назад
                </button>
            </section>
        </screen>
    );
});

/**
 * Action: Update Image info
 */
const updateImageDataRoute = app.apiCall(
    "updateImageDataApi",
    async (ctx, req) => {
        await ImagesTable.update(ctx, {
            id: req.body.id,
            title: req.body.title,
            description: req.body.description,
        });
        return ctx.router.navigate("/");
    }
);

/**
 * Action: Remove Image
 */
const removeImageRoute = app.apiCall("removeImageApi", async (ctx, req) => {
    await ImagesTable.delete(ctx, req.body.id);
    return ctx.router.navigate("/");
});

const compareRoute = app.screen("/compare", async (ctx, req) => {
    // let records = await ImagesTable.findAll(ctx, {
    //     where: {
    //         sessionId: ctx.session?.id,
    //     }
    // });
    // let [imageRecord1, imageRecord2] = records.sort(() => 0.5 - Math.random()).slice(0, 2);

    // Если картинок много, то используем свою функцию
    function getRandomNumbers(max: number): number[] {
        const numbers = new Set();
        while (numbers.size < 2) {
            numbers.add(Math.floor(Math.random() * max));
        }
        return [...numbers];
    }
    let countImages = await ImagesTable.countBy(ctx, {
        sessionId: ctx.session?.id,
    });
    const [imgNum1, imgNum2] = getRandomNumbers(countImages);

    const [imageRecord1] = await ImagesTable.findAll(ctx, {
        where: {
            sessionId: ctx.session?.id,
        },
        limit: 1,
        offset: imgNum1,
    });

    const [imageRecord2] = await ImagesTable.findAll(ctx, {
        where: {
            sessionId: ctx.session?.id,
        },
        limit: 1,
        offset: imgNum2,
    });

    return (
        <screen title="Compare images">
            <image
                src={imageRecord1.image.getThumbnailSrc(800)}
                onClick={compareRouteClicked.apiCall({
                    id1: imageRecord1.id,
                    id2: imageRecord2.id,
                    result: 1,
                })}
            />

            <image
                src={imageRecord2.image.getThumbnailSrc(800)}
                onClick={compareRouteClicked.apiCall({
                    id1: imageRecord1.id,
                    id2: imageRecord2.id,
                    result: 0,
                })}
            />

            <button onClick={refresh()} class={["section", "secondary"]}>
                Refresh
            </button>

            <button
                onClick={ctx.router.navigate("/")}
                class={["section", "secondary"]}
            >
                Back
            </button>
        </screen>
    );
});

const compareRouteClicked = app.apiCall("/compareImages", async (ctx, req) => {
    function calculateEloRating(
        playerRating: number,
        opponentRating: number,
        curResult: number
    ) {
        const kFactor = playerRating > 2400 ? 10 : 20;
        const expectedScore =
            1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
        return Math.round(playerRating + kFactor * (curResult - expectedScore));
    }

    // Получаем запись картинок
    const imageRecord1 = await ImagesTable.getById(ctx, req.body.id1);
    const imageRecord2 = await ImagesTable.getById(ctx, req.body.id2);
    const curResult = req.body.result;

    // Считаем новый рейтинг
    const rating1 = calculateEloRating(
        imageRecord1.rating,
        imageRecord2.rating,
        curResult
    );
    const rating2 = calculateEloRating(
        imageRecord2.rating,
        imageRecord1.rating,
        curResult === 1 ? 0 : 1
    );

    // Добавляем новую запись в Таблицу рейтингов
    await ImagesRating.create(ctx, {
        id1: imageRecord1.id,
        id2: imageRecord2.id,
        result: curResult,
    });

    // Обновляем новый рейтинг у Image1
    await ImagesTable.update(ctx, {
        id: imageRecord1.id,
        rating: rating1,
    });

    // Обновляем новый рейтинг у Image2
    await ImagesTable.update(ctx, {
        id: imageRecord2.id,
        rating: rating2,
    });

    return refresh();
});

