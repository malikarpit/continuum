/**
 * Meals - Nutrition tracking view with protein-first focus
 * Implements partial win recognition and contextual guidance
 */

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { MEAL_STATUS, MEAL_TYPE, MEAL_SKIP_REASONS, FOOD_CATEGORY, QUICK_ITEMS } from '../../db/mealStore';

export default function Meals() {
  const {
    meals,
    nutrition,
    foodItems,
    settings,
    logFood,
    logQuickItem,
    completeMeal,
    skipMeal,
    removeFood,
    searchFood,
    showToast
  } = useAppStore();

  const [selectedMeal, setSelectedMeal] = useState(null);
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(null);
  const [quickAddItem, setQuickAddItem] = useState(null); // For meal selection popup
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Search food items
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const results = foodItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, foodItems]);

  // Sync selectedMeal with meals array when it updates (fixes stale state after removeFood)
  useEffect(() => {
    if (selectedMeal) {
      const updatedMeal = meals.find(m => m.id === selectedMeal.id);
      if (updatedMeal && JSON.stringify(updatedMeal) !== JSON.stringify(selectedMeal)) {
        setSelectedMeal(updatedMeal);
      }
    }
  }, [meals, selectedMeal]);

  // Calculate progress percentages
  const proteinProgress = settings.proteinTarget > 0
    ? Math.min((nutrition.protein / settings.proteinTarget) * 100, 100)
    : 0;

  // Track if any nutrition is logged
  const hasAnyData = nutrition.protein > 0 || nutrition.calories > 0 || nutrition.mealsLogged > 0;

  // Calculate remaining protein
  const remainingProtein = Math.max(0, settings.proteinTarget - nutrition.protein);

  // Get protein-per-meal target
  const proteinPerMeal = Math.round(settings.proteinTarget / 4);

  // Calculate partial win status for each meal
  const getMealWinStatus = (meal) => {
    if (meal.status !== MEAL_STATUS.COMPLETED) return 'pending';
    if (meal.totals.protein >= proteinPerMeal) return 'complete'; // Hit target
    if (meal.totals.protein >= proteinPerMeal * 0.5) return 'partial'; // At least 50%
    return 'logged'; // Logged but low protein
  };

  // High protein food suggestions
  const proteinSuggestions = useMemo(() => {
    return foodItems
      .filter(f => f.protein >= 10)
      .sort((a, b) => b.protein - a.protein)
      .slice(0, 5);
  }, [foodItems]);

  const handleAddFood = async (meal, foodItem) => {
    // Calculate remaining protein before adding (current state)
    const currentProtein = nutrition.protein;
    const proteinToAdd = foodItem.protein || 0;
    const remaining = settings.proteinTarget - currentProtein - proteinToAdd;

    await logFood(meal.id, { ...foodItem, quantity: 1 });

    if (remaining > 0) {
      showToast(`+${proteinToAdd}g protein • ${remaining}g to go!`, 'success');
    } else {
      showToast(`+${proteinToAdd}g protein • Goal reached! 🎉`, 'success');
    }
  };

  const handleCompleteMeal = async (mealId) => {
    // Get meal and compute win status BEFORE async call to avoid stale state
    const meal = meals.find(m => m.id === mealId);
    const winStatus = meal ? getMealWinStatus(meal) : 'logged';

    await completeMeal(mealId);
    setSelectedMeal(null);

    if (winStatus === 'complete') {
      showToast('Excellent! Protein target hit for this meal 💪', 'success');
    } else if (winStatus === 'partial') {
      showToast('Good effort! Partial protein goal met', 'success');
    } else {
      showToast('Meal logged', 'success');
    }
  };

  const handleSkipMeal = async (mealId, reason) => {
    await skipMeal(mealId, reason);
    setShowSkipModal(null);
    showToast('Meal skipped', 'info');
  };

  // Sort meals by type order
  const sortedMeals = [...meals].sort((a, b) => {
    const order = [MEAL_TYPE.BREAKFAST, MEAL_TYPE.LUNCH, MEAL_TYPE.SNACK, MEAL_TYPE.DINNER];
    return order.indexOf(a.mealType) - order.indexOf(b.mealType);
  });

  return (
    <div className="meals-view animate-fade-in">
      <header className="view-header">
        <div>
          <h1 className="view-title">Nutrition</h1>
          <p className="view-subtitle text-secondary">
            Track your meals and macros
          </p>
        </div>
      </header>

      {/* Protein-First Macro Dashboard */}
      <section className="macro-dashboard card">
        {/* Protein Hero - Large & Prominent */}
        <div className="protein-hero">
          <div className="protein-circle">
            <svg viewBox="0 0 100 100" className="protein-ring">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke="var(--color-success)" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${proteinProgress * 2.83}, 283`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="protein-display">
              {hasAnyData ? (
                <>
                  <span className="protein-value">{nutrition.protein}g</span>
                  <span className="protein-target">/ {settings.proteinTarget}g</span>
                </>
              ) : (
                <span className="protein-empty">Not logged</span>
              )}
            </div>
          </div>
          <div className="protein-status">
            <span className="protein-label">🎯 Protein</span>
            {remainingProtein > 0 ? (
              <span className="protein-remaining">{remainingProtein}g to go</span>
            ) : (
              <span className="protein-complete">Goal reached! 🎉</span>
            )}
          </div>
        </div>

        {/* Secondary Macros */}
        <div className="secondary-macros">
          <div className="macro-item">
            <span className="macro-value">{hasAnyData ? nutrition.calories : '—'}</span>
            <span className="macro-label">Calories</span>
          </div>
          <div className="macro-item">
            <span className="macro-value">{hasAnyData ? `${nutrition.carbs}g` : '—'}</span>
            <span className="macro-label">Carbs</span>
          </div>
          <div className="macro-item">
            <span className="macro-value">{hasAnyData ? `${nutrition.fats}g` : '—'}</span>
            <span className="macro-label">Fats</span>
          </div>
        </div>

        {/* Protein Suggestions when needed - now clickable */}
        {remainingProtein > 20 && proteinSuggestions.length > 0 && (
          <div className="protein-suggestions">
            <span className="suggestions-label">🥩 Add protein:</span>
            <div className="suggestions-list">
              {proteinSuggestions.slice(0, 3).map(food => (
                <button
                  key={food.id}
                  className="suggestion-chip clickable"
                  onClick={() => {
                    const activeMeal = sortedMeals.find(m => m.status === MEAL_STATUS.PLANNED);
                    if (activeMeal) {
                      handleAddFood(activeMeal, food);
                    } else {
                      showToast('No active meal to add to', 'warning');
                    }
                  }}
                >
                  {food.name} ({food.protein}g)
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Quick Counters - Horizontal scroll for 6+ items */}
      <section className="quick-counters card mt-4">
        <h3 className="section-label mb-3">⚡ Quick Add</h3>
        <div className="quick-buttons-wrapper">
          <div className="quick-buttons">
            {Object.entries(QUICK_ITEMS).map(([key, item]) => (
              <button
                key={key}
                className="quick-btn"
                onClick={() => {
                  // Open meal selector popup
                  setQuickAddItem({ key, item });
                }}
              >
                <span className="quick-icon">{item.icon}</span>
                <span className="quick-name">{item.name}</span>
                <span className="quick-protein">+{item.protein}g</span>
              </button>
            ))}
          </div>
          <div className="scroll-hint">Swipe →</div>
        </div>
      </section>

      {/* Meals List */}
      <section className="meals-list mt-6">
        <div className="meals-header">
          <h3 className="section-label">Today's Meals</h3>
          <span className="meals-progress">
            {nutrition.mealsLogged}/{meals.length} logged
          </span>
        </div>
        <div className="meals-grid">
          {sortedMeals.map(meal => (
            <MealCard
              key={meal.id}
              meal={meal}
              proteinTarget={proteinPerMeal}
              winStatus={getMealWinStatus(meal)}
              onSelect={() => setSelectedMeal(meal)}
              onComplete={() => handleCompleteMeal(meal.id)}
              onSkip={() => setShowSkipModal(meal.id)}
            />
          ))}
        </div>
      </section>

      {/* Selected Meal Detail */}
      {selectedMeal && (
        <MealDetailModal
          meal={selectedMeal}
          foodItems={foodItems}
          onClose={() => setSelectedMeal(null)}
          onAddFood={(food) => handleAddFood(selectedMeal, food)}
          onComplete={() => handleCompleteMeal(selectedMeal.id)}
          onRemoveFood={async (foodItemId) => {
            try {
              const mealId = selectedMeal.id;
              await removeFood(mealId, foodItemId);
              // Use getState() to get fresh meals after the async update
              const freshMeals = useAppStore.getState().meals;
              const updatedMeal = freshMeals.find(m => m.id === mealId);
              if (updatedMeal) {
                setSelectedMeal(updatedMeal);
              }
              showToast('Item removed', 'success');
            } catch (error) {
              showToast(error.message || 'Failed to remove item', 'error');
            }
          }}
        />
      )}

      {/* Skip Meal Modal */}
      {showSkipModal && (
        <SkipMealModal
          onClose={() => setShowSkipModal(null)}
          onSkip={(reason) => handleSkipMeal(showSkipModal, reason)}
        />
      )}

      {/* Quick Add Meal Selector */}
      {quickAddItem && (
        <QuickAddMealSelector
          item={quickAddItem}
          meals={sortedMeals}
          onSelect={async (mealId) => {
            try {
              await logQuickItem(mealId, quickAddItem.key, 1);
              showToast(`+${quickAddItem.item.protein}g protein from ${quickAddItem.item.name}`, 'success');
              setQuickAddItem(null);
            } catch (error) {
              showToast(error.message || 'Failed to add item', 'error');
            }
          }}
          onClose={() => setQuickAddItem(null)}
        />
      )}

      <style>{mealsStyles}</style>
    </div>
  );
}

// Meal Card Component with partial win recognition
function MealCard({ meal, proteinTarget, winStatus, onSelect, onComplete, onSkip }) {
  const mealIcons = {
    [MEAL_TYPE.BREAKFAST]: '🌅',
    [MEAL_TYPE.LUNCH]: '☀️',
    [MEAL_TYPE.SNACK]: '🍎',
    [MEAL_TYPE.DINNER]: '🌙',
  };

  const isCompleted = meal.status === MEAL_STATUS.COMPLETED;
  const isSkipped = meal.status === MEAL_STATUS.SKIPPED;
  const isPending = meal.status === MEAL_STATUS.PLANNED;

  // Win status badges
  const winBadges = {
    complete: { text: '💪 Protein goal hit!', class: 'badge-success' },
    partial: { text: '↗️ Good progress', class: 'badge-info' },
    logged: { text: '✓ Logged', class: 'badge-muted' },
  };

  return (
    <div className={`meal-card card ${isCompleted ? 'completed' : ''} ${isSkipped ? 'skipped' : ''} ${winStatus === 'complete' ? 'win-complete' : ''}`}>
      <div className="meal-header">
        <div className="meal-icon">{mealIcons[meal.mealType]}</div>
        <div className="meal-info">
          <div className="meal-name">{meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}</div>
          <div className="meal-status">
            {isCompleted && winBadges[winStatus] && (
              <span className={`badge ${winBadges[winStatus].class}`}>
                {winBadges[winStatus].text}
              </span>
            )}
            {isSkipped && <span className="badge badge-warning">Skipped</span>}
            {isPending && <span className="badge badge-info">Pending</span>}
          </div>
        </div>
        {isCompleted && (
          <div className="meal-macros text-right">
            {/* Protein first, then calories */}
            <div className="text-lg font-semibold text-success">{meal.totals.protein}g</div>
            <div className="text-sm text-secondary">{meal.totals.calories} kcal</div>
          </div>
        )}
      </div>

      {/* Protein progress for pending meals */}
      {isPending && proteinTarget > 0 && (
        <div className="meal-protein-hint">
          <span className="hint-text">Target: ~{proteinTarget}g protein</span>
        </div>
      )}

      {/* Logged Items Preview */}
      {meal.loggedItems?.length > 0 && (
        <div className="meal-items">
          {meal.loggedItems.slice(0, 3).map((item, i) => (
            <span key={i} className="food-tag">{item.name}</span>
          ))}
          {meal.loggedItems.length > 3 && (
            <span className="food-tag more">+{meal.loggedItems.length - 3} more</span>
          )}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="meal-actions">
          <button className="btn btn-primary btn-sm" onClick={onSelect}>
            Log Food
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onSkip}>
            Skip
          </button>
        </div>
      )}

      {isCompleted && (
        <div className="meal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onSelect}>
            Add More
          </button>
        </div>
      )}
    </div>
  );
}

// Meal Detail Modal
function MealDetailModal({ meal, foodItems, onClose, onAddFood, onComplete, onRemoveFood }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [customFood, setCustomFood] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fats: '',
  });
  const [showCustom, setShowCustom] = useState(false);

  // Filter food items
  const filteredFoods = foodItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddCustom = () => {
    if (!customFood.name) return;
    onAddFood({
      name: customFood.name,
      calories: parseInt(customFood.calories) || 0,
      protein: parseInt(customFood.protein) || 0,
      carbs: parseInt(customFood.carbs) || 0,
      fats: parseInt(customFood.fats) || 0,
      type: 'estimated',
    });
    setCustomFood({ name: '', calories: '', protein: '', carbs: '', fats: '' });
    setShowCustom(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal meal-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Current Totals */}
          <div className="current-totals">
            <div className="total-item">
              <span className="total-value">{meal.totals.calories}</span>
              <span className="total-label">kcal</span>
            </div>
            <div className="total-item">
              <span className="total-value text-success">{meal.totals.protein}g</span>
              <span className="total-label">protein</span>
            </div>
            <div className="total-item">
              <span className="total-value">{meal.totals.carbs}g</span>
              <span className="total-label">carbs</span>
            </div>
            <div className="total-item">
              <span className="total-value">{meal.totals.fats}g</span>
              <span className="total-label">fats</span>
            </div>
          </div>

          {/* Logged Items - now with delete buttons */}
          {meal.loggedItems?.length > 0 && (
            <div className="logged-items">
              <h4 className="text-sm text-secondary mb-2">Added Items</h4>
              <div className="items-list">
                {meal.loggedItems.map((item, i) => (
                  <div key={item.id || i} className="logged-item">
                    <div className="item-info">
                      <span className="item-name">{item.name}</span>
                      <span className="item-macros text-secondary">
                        {item.calories} kcal • {item.protein}g P
                      </span>
                    </div>
                    {onRemoveFood && (
                      <button
                        className="remove-item-btn"
                        onClick={() => onRemoveFood(item.id)}
                        title="Remove item"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="food-search mt-4">
            <input
              type="text"
              className="input"
              placeholder="Search foods..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <div className="category-filters">
            {['all', ...Object.values(FOOD_CATEGORY)].map(cat => (
              <button
                key={cat}
                className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Food List */}
          <div className="food-list">
            {filteredFoods.slice(0, 10).map(food => (
              <div key={food.id} className="food-item" onClick={() => onAddFood(food)}>
                <div className="food-info">
                  <div className="food-name">{food.name}</div>
                  <div className="food-serving text-secondary">{food.servingSize}</div>
                </div>
                <div className="food-macros">
                  <div>{food.calories} kcal</div>
                  <div className="text-success">{food.protein}g P</div>
                </div>
                <button className="add-btn">+</button>
              </div>
            ))}
          </div>

          {/* Custom Food Entry */}
          <div className="custom-food-section">
            {!showCustom ? (
              <button className="btn btn-ghost w-full" onClick={() => setShowCustom(true)}>
                + Add Custom Food
              </button>
            ) : (
              <div className="custom-food-form">
                <input
                  type="text"
                  className="input mb-2"
                  placeholder="Food name"
                  value={customFood.name}
                  onChange={e => setCustomFood({ ...customFood, name: e.target.value })}
                />
                <div className="custom-macros">
                  <input
                    type="number"
                    className="input"
                    placeholder="Calories"
                    value={customFood.calories}
                    onChange={e => setCustomFood({ ...customFood, calories: e.target.value })}
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="Protein"
                    value={customFood.protein}
                    onChange={e => setCustomFood({ ...customFood, protein: e.target.value })}
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="Carbs"
                    value={customFood.carbs}
                    onChange={e => setCustomFood({ ...customFood, carbs: e.target.value })}
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="Fats"
                    value={customFood.fats}
                    onChange={e => setCustomFood({ ...customFood, fats: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary btn-sm" onClick={handleAddCustom}>
                    Add Food
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCustom(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary"
            onClick={onComplete}
            disabled={meal.status === MEAL_STATUS.COMPLETED && meal.loggedItems.length === 0}
          >
            {meal.status === MEAL_STATUS.COMPLETED ? 'Done' : 'Complete Meal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Skip Meal Modal
function SkipMealModal({ onClose, onSkip }) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalReason = reason === 'Custom reason' ? customReason : reason;
    if (!finalReason.trim()) return;
    onSkip(finalReason);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Skip Meal</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-secondary mb-4">
              Why are you skipping this meal?
            </p>
            <div className="reason-options">
              {MEAL_SKIP_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className={`reason-btn ${reason === r ? 'active' : ''}`}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Custom reason' && (
              <input
                type="text"
                className="input mt-4"
                placeholder="Enter your reason..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!reason || (reason === 'Custom reason' && !customReason.trim())}
            >
              Skip Meal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Quick Add Meal Selector - Choose which meal to add quick item to
function QuickAddMealSelector({ item, meals, onSelect, onClose }) {
  const mealIcons = {
    [MEAL_TYPE.BREAKFAST]: '🌅',
    [MEAL_TYPE.LUNCH]: '☀️',
    [MEAL_TYPE.SNACK]: '🍎',
    [MEAL_TYPE.DINNER]: '🌙',
  };

  // Only show meals that can receive food (not skipped or unlogged)
  const availableMeals = meals.filter(m =>
    m.status === MEAL_STATUS.PLANNED || m.status === MEAL_STATUS.COMPLETED
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal meal-selector-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Add {item.item.name}
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="text-secondary mb-4">Select a meal to add to:</p>

          <div className="meal-selector-grid">
            {availableMeals.map(meal => (
              <button
                key={meal.id}
                className={`meal-selector-btn ${meal.status === MEAL_STATUS.COMPLETED ? 'completed' : ''}`}
                onClick={() => onSelect(meal.id)}
              >
                <span className="meal-selector-icon">{mealIcons[meal.mealType]}</span>
                <span className="meal-selector-name">
                  {meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}
                </span>
                <span className="meal-selector-stats">
                  {meal.totals.protein}g protein • {meal.totals.calories} kcal
                </span>
                {meal.status === MEAL_STATUS.COMPLETED && (
                  <span className="meal-selector-badge">✓ Done</span>
                )}
              </button>
            ))}
          </div>

          {availableMeals.length === 0 && (
            <p className="text-center text-warning mt-4">
              No active meals available. All meals are skipped or unlogged.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const mealsStyles = `
  .meals-view {
    max-width: 900px;
    margin: 0 auto;
  }

  .view-header {
    margin-bottom: var(--spacing-6);
  }

  .view-title {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
  }

  .view-subtitle {
    margin-top: var(--spacing-1);
  }

  .section-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--spacing-3);
  }

  .macro-dashboard {
    padding: var(--spacing-6);
  }

  /* Protein Hero Section */
  .protein-hero {
    display: flex;
    align-items: center;
    gap: var(--spacing-6);
    margin-bottom: var(--spacing-6);
  }

  .protein-circle {
    position: relative;
    width: 120px;
    height: 120px;
    flex-shrink: 0;
  }

  .protein-ring {
    width: 100%;
    height: 100%;
  }

  .protein-display {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  .protein-value {
    display: block;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-success);
  }

  .protein-target {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .protein-empty {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .protein-status {
    flex: 1;
  }

  .protein-label {
    display: block;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--spacing-1);
  }

  .protein-remaining {
    color: var(--color-text-secondary);
  }

  .protein-complete {
    color: var(--color-success);
    font-weight: var(--font-weight-medium);
  }

  /* Secondary Macros */
  .secondary-macros {
    display: flex;
    justify-content: space-around;
    padding: var(--spacing-4);
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-lg);
  }

  .macro-item {
    text-align: center;
  }

  .macro-value {
    display: block;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
  }

  .macro-label {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  /* Protein Suggestions */
  .protein-suggestions {
    margin-top: var(--spacing-4);
    padding: var(--spacing-3);
    background: rgba(34, 197, 94, 0.1);
    border-radius: var(--radius-md);
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .suggestions-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .suggestions-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    margin-top: var(--spacing-2);
  }

  .suggestion-chip {
    padding: var(--spacing-1) var(--spacing-2);
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
  }

  /* Quick Counters */
  .quick-counters {
    padding: var(--spacing-4);
  }

  .quick-buttons-wrapper {
    position: relative;
  }

  .quick-buttons {
    display: flex;
    gap: var(--spacing-3);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    padding-bottom: var(--spacing-2);
    scrollbar-width: none;
  }

  .quick-buttons::-webkit-scrollbar {
    display: none;
  }

  .scroll-hint {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    pointer-events: none;
    opacity: 0.7;
    animation: fadeHint 3s forwards;
  }

  @keyframes fadeHint {
    0%, 50% { opacity: 0.7; }
    100% { opacity: 0; }
  }

  .quick-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-3);
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-width: 85px;
    flex-shrink: 0;
  }

  .quick-btn:hover {
    transform: scale(1.05);
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.4) 0%, rgba(139, 92, 246, 0.4) 100%);
    border-color: rgba(139, 92, 246, 0.6);
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
  }

  .quick-btn:active {
    transform: scale(0.95);
  }

  .quick-icon {
    font-size: 1.5rem;
    margin-bottom: var(--spacing-1);
  }

  .quick-name {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .quick-protein {
    font-size: var(--font-size-xs);
    color: var(--color-success);
    font-weight: var(--font-weight-semibold);
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--spacing-2);
  }

  .meals-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-3);
  }

  .meals-progress {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .meals-grid {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .meal-card {
    padding: var(--spacing-4);
    transition: all var(--transition-fast);
  }

  .meal-card.completed {
    border-color: var(--color-success);
    background: var(--color-success-light);
  }

  .meal-card.win-complete {
    border-color: var(--color-success);
    box-shadow: 0 0 15px rgba(34, 197, 94, 0.2);
  }

  .meal-card.skipped {
    opacity: 0.6;
  }

  .meal-protein-hint {
    margin-top: var(--spacing-2);
    padding: var(--spacing-2);
    background: rgba(34, 197, 94, 0.1);
    border-radius: var(--radius-sm);
  }

  .hint-text {
    font-size: var(--font-size-xs);
    color: var(--color-success);
  }

  .badge-muted {
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
  }

  .meal-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-3);
  }

  .meal-icon {
    font-size: 1.5rem;
  }

  .meal-info {
    flex: 1;
  }

  .meal-name {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-lg);
    margin-bottom: var(--spacing-1);
  }

  .meal-items {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    margin-top: var(--spacing-3);
  }

  .food-tag {
    padding: var(--spacing-1) var(--spacing-2);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
  }

  .food-tag.more {
    background: var(--color-accent-light);
    color: var(--color-accent);
  }

  .meal-actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-4);
    justify-content: flex-end;
  }

  /* Modal Styles */
  .meal-modal {
    max-width: 600px;
    max-height: 85vh;
  }

  .current-totals {
    display: flex;
    justify-content: space-around;
    padding: var(--spacing-4);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-4);
  }

  .total-item {
    text-align: center;
  }

  .total-value {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    display: block;
  }

  .total-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .logged-items {
    margin-bottom: var(--spacing-4);
    padding: var(--spacing-3);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  .logged-item {
    display: flex;
    justify-content: space-between;
    padding: var(--spacing-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .logged-item:last-child {
    border-bottom: none;
  }

  .category-filters {
    display: flex;
    gap: var(--spacing-2);
    overflow-x: auto;
    padding: var(--spacing-3) 0;
    margin-bottom: var(--spacing-3);
  }

  .filter-btn {
    padding: var(--spacing-1) var(--spacing-3);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .filter-btn:hover {
    border-color: var(--color-accent);
  }

  .filter-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  .food-list {
    max-height: 250px;
    overflow-y: auto;
  }

  .food-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3);
    border-bottom: 1px solid var(--color-border);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .food-item:hover {
    background: var(--color-bg-tertiary);
  }

  .food-info {
    flex: 1;
  }

  .food-name {
    font-weight: var(--font-weight-medium);
  }

  .food-serving {
    font-size: var(--font-size-sm);
  }

  .food-macros {
    text-align: right;
    font-size: var(--font-size-sm);
  }

  .add-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-full);
    color: white;
    font-size: 1.25rem;
    cursor: pointer;
    transition: transform var(--transition-fast);
  }

  .add-btn:hover {
    transform: scale(1.1);
  }

  .custom-food-section {
    margin-top: var(--spacing-4);
    padding-top: var(--spacing-4);
    border-top: 1px solid var(--color-border);
  }

  .custom-macros {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-2);
  }

  @media (max-width: 500px) {
    .custom-macros {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .reason-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
  }

  .reason-btn {
    padding: var(--spacing-2) var(--spacing-4);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .reason-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .reason-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  /* Clickable suggestion chips */
  .suggestion-chip.clickable {
    cursor: pointer;
    border: none;
    transition: all var(--transition-fast);
  }

  .suggestion-chip.clickable:hover {
    background: rgba(34, 197, 94, 0.3);
    transform: scale(1.05);
  }

  /* Horizontal scrolling for quick buttons */
  .quick-buttons {
    display: flex;
    gap: var(--spacing-3);
    overflow-x: auto;
    padding-bottom: var(--spacing-2);
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }

  .quick-buttons::-webkit-scrollbar {
    height: 4px;
  }

  .quick-buttons::-webkit-scrollbar-track {
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
  }

  .quick-buttons::-webkit-scrollbar-thumb {
    background: var(--color-accent);
    border-radius: var(--radius-full);
  }

  .quick-btn {
    scroll-snap-align: start;
    flex-shrink: 0;
    min-width: 90px;
  }

  /* Remove item button in meal modal */
  .logged-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
  }

  .item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .remove-item-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-full);
    color: var(--color-error);
    font-size: 1.25rem;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .remove-item-btn:hover {
    background: var(--color-error);
    border-color: var(--color-error);
    color: white;
    transform: scale(1.1);
  }

  /* Meal Selector Modal */
  .meal-selector-modal {
    max-width: 400px;
  }

  .meal-selector-grid {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .meal-selector-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-1);
    padding: var(--spacing-4);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
    text-align: left;
  }

  .meal-selector-btn:hover {
    border-color: var(--color-accent);
    background: rgba(99, 102, 241, 0.1);
    transform: translateY(-2px);
  }

  .meal-selector-btn.completed {
    border-color: var(--color-success);
    background: var(--color-success-light);
  }

  .meal-selector-icon {
    font-size: 1.5rem;
  }

  .meal-selector-name {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-lg);
  }

  .meal-selector-stats {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .meal-selector-badge {
    position: absolute;
    top: var(--spacing-2);
    right: var(--spacing-2);
    padding: var(--spacing-1) var(--spacing-2);
    background: var(--color-success);
    color: white;
    font-size: var(--font-size-xs);
    border-radius: var(--radius-sm);
  }
`;
