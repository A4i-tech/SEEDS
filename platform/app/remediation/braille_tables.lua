function Header(h)
  return pandoc.Para(h.content)
end

function Image(i)
  local caption = pandoc.utils.stringify(i.caption)
  return pandoc.Str("[Image: " .. (caption ~= "" and caption or "no description") .. "]")
end

local function header_names(head)
  local names = {}
  for _, row in ipairs(head.rows) do
    local col = 1
    for _, cell in ipairs(row.cells) do
      local text = pandoc.utils.stringify(cell)
      for c = col, col + cell.col_span - 1 do
        if text ~= "" then
          names[c] = names[c] and (names[c] .. " " .. text) or text
        end
      end
      col = col + cell.col_span
    end
  end
  return names
end

local function row_text(row, names)
  local parts = {}
  for i, cell in ipairs(row.cells) do
    local value = pandoc.utils.stringify(cell)
    local name = names[i]
    parts[#parts + 1] = name and (name .. ": " .. value) or value
  end
  return table.concat(parts, "; ")
end

function Table(t)
  local names = header_names(t.head)
  local items = {}
  for _, body in ipairs(t.bodies) do
    for _, row in ipairs(body.body) do
      items[#items + 1] = {pandoc.Plain(pandoc.Str(row_text(row, names)))}
    end
  end
  for _, row in ipairs(t.foot.rows) do
    items[#items + 1] = {pandoc.Plain(pandoc.Str(row_text(row, names)))}
  end
  local blocks = {}
  local caption = pandoc.utils.stringify(t.caption.long)
  if caption ~= "" then
    blocks[#blocks + 1] = pandoc.Para(pandoc.Str(caption))
  end
  blocks[#blocks + 1] = pandoc.BulletList(items)
  return blocks
end
