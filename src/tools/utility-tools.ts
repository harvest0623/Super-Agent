import { jsonSchema } from "ai";

export const weatherTool = {
    description: '查询指定城市的天气信息',
    inputSchema: jsonSchema({
        type: 'object',
        properties: {
            city: {
                type: 'string',
                description: '城市名称，比如："南昌"、"北京"'
            }
        },
        required: ['city'],
        additionalProperties: false,
    }),
    execute: async ({ city }: { city: string }) => {
        const mockWeather: Record<string, string> = {
            '南昌': '晴, 30摄氏度, 东南风2级',
            '北京': '雨, 25摄氏度, 东北风1级',
            '上海': '阴, 22摄氏度, 西南风4级',
        }
        return mockWeather[city] || `${city}的天气信息暂未记录`
    }
}

// {
//     "type": "function",
//         "function": {
//         "name": "get_weather",
//             "description": "查询指定城市的天气信息",
//                 "parameters": {
//             "type": "object",
//                 "properties": {
//                 "city": { "type": "string", "description": "城市名称" }
//             },
//             "required": ["city"]
//         }
//     }
// }