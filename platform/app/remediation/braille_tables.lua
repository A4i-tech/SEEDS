function Header(h)
  return pandoc.Para(h.content)
end

function Image(i)
  return pandoc.Str("[Image: " .. pandoc.utils.stringify(i.caption) .. "]")
end

function Table(t)
  local names = {}
  if #t.head.rows > 0 then
    for _, cell in ipairs(t.head.rows[1].cells) do
      names[#names + 1] = pandoc.utils.stringify(cell)
    end
  end
  local items = {}
  for _, body in ipairs(t.bodies) do
    for _, row in ipairs(body.body) do
      local parts = {}
      for i, cell in ipairs(row.cells) do
        local value = pandoc.utils.stringify(cell)
        local name = names[i]
        parts[#parts + 1] = (name and name ~= "") and (name .. ": " .. value) or value
      end
      items[#items + 1] = {pandoc.Plain(pandoc.Str(table.concat(parts, "; ")))}
    end
  end
  return pandoc.BulletList(items)
end
